#!/usr/bin/env node
/**
 * Gera prototype/index.html protegido por login.
 *
 * O protótipo completo (com nomes, e-mails e tarefas do time) é criptografado
 * com AES-256-GCM. A chave é derivada da senha com PBKDF2-SHA256 (600.000
 * iterações) e um salt aleatório. No repositório fica só o texto cifrado:
 * sem a senha, nada do conteúdo pode ser lido.
 *
 * A SENHA NUNCA É GRAVADA EM ARQUIVO. Ela é lida da variável de ambiente
 * PROTOTYPE_PASSWORD no momento do build.
 *
 * Uso:
 *   PROTOTYPE_PASSWORD='...' node prototype/build-locked.mjs <app.html> [saida.html]
 *
 * <app.html> é o protótipo em texto aberto. Ele NÃO deve ser versionado
 * (está no .gitignore como prototype/app.private.html).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto as crypto } from "node:crypto";

const [, , input = "prototype/app.private.html", output = "prototype/index.html"] = process.argv;
const password = process.env.PROTOTYPE_PASSWORD;
if (!password) {
  console.error("Defina PROTOTYPE_PASSWORD no ambiente. A senha não fica em nenhum arquivo.");
  process.exit(1);
}

const ITERATIONS = 600_000;
const html = readFileSync(input, "utf8");

// Lista de e-mails autorizados = e-mails dos integrantes ATIVOS do protótipo
// (linhas com `email: "..."` que não tenham `active: false`).
const emails = [...new Set(html.split("\n").filter((l) => !/active:\s*false/.test(l)).flatMap((l) => [...l.matchAll(/email: "([^"]+@[^"]+)"/g)]).map((m) => m[1].toLowerCase()))];
// Logo da SLC Sementes (público) na tela de login.
const here = dirname(fileURLToPath(import.meta.url));
const logo = readFileSync(join(here, "assets", "slc-sementes.svg"), "utf8").replace("<svg ", '<svg class="logo" ');
const symbol = readFileSync(join(here, "assets", "slc-sementes-simbolo.svg"), "utf8").replace(/currentColor/g, "#31A940");
if (emails.length === 0) {
  console.error("Nenhum e-mail encontrado no protótipo (campo email: \"...\").");
  process.exit(1);
}

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
  baseKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
);
const payload = enc.encode(JSON.stringify({ emails, html }));
const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload));
const b64 = (u8) => Buffer.from(u8).toString("base64");

const shell = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Seed Production Task Tracker — acesso restrito</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(symbol)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100dvh;display:grid;place-items:center;padding:24px;background:#0A0B0A;color:#fff;font-family:'Figtree',system-ui,sans-serif;font-size:14px}
main{width:100%;max-width:380px}
.logo{display:block;width:200px;height:auto;color:#F0EDEB;margin:0 0 26px}
h1{font-size:24px;font-weight:700;line-height:1.2;margin:0}h1 span{color:#00C65E}
.sub{margin:6px 0 28px;color:#9BA39A}
form{display:grid;gap:16px;padding:24px;border:1px solid #262A26;border-radius:14px;background:#141614}
label{display:grid;gap:6px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9BA39A}
input{height:42px;padding:0 12px;border:1px solid #262A26;border-radius:8px;background:#0A0B0A;color:#fff;font:inherit;font-size:15px;letter-spacing:0;text-transform:none}
input:focus{outline:none;border-color:#00C65E}
button{height:44px;border:0;border-radius:8px;background:#00C65E;color:#0A0B0A;font:inherit;font-weight:700;font-size:15px;cursor:pointer}
button[disabled]{opacity:.6;cursor:wait}
:focus-visible{outline:2px solid #00C65E;outline-offset:2px}
.err{margin:0;color:#FF8A65;font-weight:600;min-height:20px}
.note{margin:18px 0 0;font-size:12px;color:#9BA39A;line-height:1.5}
</style>
</head>
<body>
<main>
  ${logo}
  <h1>Seed Production <span>Task Tracker</span></h1>
  <p class="sub">Administrativo · Produção de Sementes</p>
  <form id="login" novalidate>
    <label>E-mail<input id="email" type="email" autocomplete="username" required autofocus></label>
    <label>Senha<input id="password" type="password" autocomplete="current-password" required></label>
    <p class="err" id="err" role="alert"></p>
    <button id="go" type="submit">Entrar</button>
  </form>
  <p class="note">Protótipo de uso interno. O conteúdo desta página é criptografado e só é aberto com o e-mail de um integrante do time e a senha de acesso.</p>
</main>
<script>
"use strict";
const DATA = { salt: "${b64(salt)}", iv: "${b64(iv)}", iterations: ${ITERATIONS}, cipher: "${b64(cipher)}" };
const u8 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
document.getElementById("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const err = document.getElementById("err"), go = document.getElementById("go");
  err.textContent = "";
  if (!email || !password) { err.textContent = "Informe e-mail e senha."; return; }
  go.disabled = true; go.textContent = "Verificando…";
  try {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: u8(DATA.salt), iterations: DATA.iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u8(DATA.iv) }, key, u8(DATA.cipher));
    const { emails, html } = JSON.parse(new TextDecoder().decode(plain));
    if (!emails.includes(email)) throw new Error("email");
    const withUser = html.replace("<head>", "<head><script>window.__SAFRA_LOGIN__=" + JSON.stringify(email) + ";<\\/script>");
    document.open(); document.write(withUser); document.close();
  } catch {
    err.textContent = "E-mail ou senha incorretos.";
    go.disabled = false; go.textContent = "Entrar";
  }
});
</script>
</body>
</html>
`;

writeFileSync(output, shell);
console.log(`Gerado ${output}: ${emails.length} e-mails autorizados, ${(cipher.length / 1024).toFixed(2)} KB cifrados.`);
