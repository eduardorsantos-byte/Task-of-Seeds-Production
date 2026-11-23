/**
 * Harness de testes de banco: cria um banco PostgreSQL descartável, aplica a
 * emulação do Supabase (supabase/tests/supabase_stubs.sql) e todas as migrações.
 *
 * Requer TEST_DATABASE_URL apontando para um servidor Postgres (>= 15) com
 * permissão para CREATE DATABASE. Ex.: postgres://postgres@localhost:5432/postgres
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

export type Db = {
  /** Executa como superusuário (equivale ao service role / migrações). */
  admin: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  /** Executa como usuário autenticado (role authenticated + JWT sub). */
  as: <T = Record<string, unknown>>(userId: string | null, sql: string, params?: unknown[]) => Promise<T[]>;
  /** Cria um usuário em auth.users (dispara criação de perfil e aceite de convites). */
  createUser: (email: string, fullName?: string) => Promise<string>;
  close: () => Promise<void>;
};

export async function createTestDb(): Promise<Db> {
  const baseUrl = process.env.TEST_DATABASE_URL!;
  const dbName = `dp_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const root = new Client({ connectionString: baseUrl });
  await root.connect();
  await root.query(`create database ${dbName}`);
  await root.end();

  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  // Silencia avisos de wal_level da publicação de Realtime emulada.
  client.on("notice", () => undefined);

  await client.query(readFileSync(join(ROOT, "supabase/tests/supabase_stubs.sql"), "utf8"));
  const migrationsDir = join(ROOT, "supabase/migrations");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(join(migrationsDir, file), "utf8"));
  }

  const admin: Db["admin"] = async (sql, params) => (await client.query(sql, params)).rows;

  const as: Db["as"] = async (userId, sql, params) => {
    await client.query("begin");
    try {
      await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" }),
      ]);
      const res = await client.query(sql, params);
      await client.query("commit");
      return res.rows;
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  };

  const createUser: Db["createUser"] = async (email, fullName) => {
    const rows = await admin<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, JSON.stringify(fullName ? { full_name: fullName } : {})],
    );
    return rows[0].id;
  };

  const close = async () => {
    await client.end();
    const cleanup = new Client({ connectionString: baseUrl });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${dbName} with (force)`);
    await cleanup.end();
  };

  return { admin, as, createUser, close };
}
