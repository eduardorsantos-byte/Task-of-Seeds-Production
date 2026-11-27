#!/usr/bin/env node
/**
 * Gera prototype/index.html protegido por login individual.
 *
 * O protótipo completo (com nomes, e-mails e tarefas do time) é criptografado
 * com AES-256-GCM usando uma chave de conteúdo aleatória. Essa chave é
 * "embrulhada" uma vez para cada integrante ATIVO, com uma chave derivada da
 * senha individual dele (PBKDF2-SHA256, 600.000 iterações, salt próprio).
 * No repositório ficam só textos cifrados e o hash (SHA-256) de cada e-mail:
 * sem um e-mail ativo e a senha dessa pessoa, nada do conteúdo pode ser lido.
 * Desativar alguém e publicar de novo corta o acesso dessa pessoa.
 *
 * AS SENHAS NUNCA SÃO GRAVADAS NO REPOSITÓRIO. Ficam num arquivo JSON fora
 * dele, indicado pela variável SPTT_PASSWORDS ({"email": "senha"}). Para quem
 * ainda não tem senha, o script gera uma senha provisória aleatória e a grava
 * nesse arquivo (o administrador a entrega à pessoa por canal privado).
 *
 * Uso:
 *   SPTT_PASSWORDS=/caminho/fora/do/repo/senhas.json node prototype/build-locked.mjs [app.html] [saida.html]
 *
 * <app.html> é o protótipo em texto aberto. Ele NÃO deve ser versionado
 * (está no .gitignore como prototype/app.private.html).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto as crypto } from "node:crypto";

const [, , input = "prototype/app.private.html", output = "prototype/index.html"] = process.argv;
const secretsPath = process.env.SPTT_PASSWORDS;
if (!secretsPath) {
  console.error("Defina SPTT_PASSWORDS com o caminho do arquivo de senhas (fora do repositório).");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
if (resolve(secretsPath).startsWith(resolve(here, ".."))) {
  console.error("O arquivo de senhas não pode ficar dentro do repositório.");
  process.exit(1);
}

const ITERATIONS = 600_000;
const html = readFileSync(input, "utf8");

// Integrantes ATIVOS do protótipo (linhas com `email: "..."` sem `active: false`).
const emails = [...new Set(html.split("\n").filter((l) => !/active:\s*false/.test(l)).flatMap((l) => [...l.matchAll(/email: "([^"]+@[^"]+)"/g)]).map((m) => m[1].toLowerCase()))];
if (emails.length === 0) {
  console.error("Nenhum e-mail ativo encontrado no protótipo (campo email: \"...\").");
  process.exit(1);
}

// Senhas individuais: lidas do arquivo externo; geradas para quem ainda não tem.
const secrets = existsSync(secretsPath) ? JSON.parse(readFileSync(secretsPath, "utf8")) : {};
const ALPHA = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newPassword = () => { const r = crypto.getRandomValues(new Uint8Array(14)); return Array.from(r, (b) => ALPHA[b % ALPHA.length]).join("").replace(/(.{5})(.{4})(.{5})/, "$1-$2-$3"); };
const created = [];
for (const e of emails) if (!secrets[e]) { secrets[e] = newPassword(); created.push(e); }
for (const e of emails) if (String(secrets[e]).length < 10) { console.error(`Senha de ${e} tem menos de 10 caracteres.`); process.exit(1); }
writeFileSync(secretsPath, JSON.stringify(secrets, null, 2) + "\n", { mode: 0o600 });

// Logo da SLC Sementes (público) na tela de login.
const logo = readFileSync(join(here, "assets", "slc-sementes.svg"), "utf8").replace("<svg ", '<svg class="logo" ');
const symbol = readFileSync(join(here, "assets", "slc-sementes-simbolo.svg"), "utf8").replace(/currentColor/g, "#70AC62");

const enc = new TextEncoder();
const b64 = (u8) => Buffer.from(u8).toString("base64");
const hex = (buf) => Buffer.from(buf).toString("hex");
const idOf = async (email) => hex(await crypto.subtle.digest("SHA-256", enc.encode("sptt:" + email)));

// 1) conteúdo cifrado com a chave de conteúdo
const contentKey = crypto.getRandomValues(new Uint8Array(32));
const ck = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
const iv = crypto.getRandomValues(new Uint8Array(12));
const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, ck, enc.encode(html)));

// 2) chave de conteúdo embrulhada para cada pessoa ativa
const USERS = {};
for (const email of emails) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), wiv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", enc.encode(email + "\n" + secrets[email]), "PBKDF2", false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: wiv }, kek, contentKey));
  USERS[await idOf(email)] = { s: b64(salt), i: b64(wiv), w: b64(wrapped) };
}

const shell = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'">
<title>Seed Production Task Tracker — acesso restrito</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(symbol)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100dvh;display:grid;place-items:center;padding:24px;background:#111815;color:#fff;font-family:'Figtree',system-ui,sans-serif;font-size:14px}
main{width:100%;max-width:380px}
.logo{display:block;width:200px;height:auto;color:#F0EDEB;margin:0 0 26px}
h1{font-size:24px;font-weight:700;line-height:1.2;margin:0}h1 span{color:#70AC62}
.sub{margin:6px 0 28px;color:#9EABA4}
form{display:grid;gap:16px;padding:24px;border:1px solid #2A3731;border-radius:14px;background:#18211D}
label{display:grid;gap:6px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9EABA4}
input{height:42px;padding:0 12px;border:1px solid #36463F;border-radius:8px;background:#111815;color:#fff;font:inherit;font-size:15px;letter-spacing:0;text-transform:none}
input:focus{outline:none;border-color:#70AC62}
button{height:44px;border:0;border-radius:8px;background:#70AC62;color:#0F1712;font:inherit;font-weight:700;font-size:15px;cursor:pointer}
button[disabled]{opacity:.6;cursor:wait}
.info{margin:0;padding:10px 12px;border-radius:8px;background:#1F2A25;color:#D8E0DB;font-size:13px}
:focus-visible{outline:2px solid #70AC62;outline-offset:2px}
.err{margin:0;color:#FF8A65;font-weight:600;min-height:20px}
.note{margin:18px 0 0;font-size:12px;color:#9EABA4;line-height:1.5}
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
    <p class="info" id="info" role="status" hidden></p>
    <p class="err" id="err" role="alert"></p>
    <button id="go" type="submit">Entrar</button>
  </form>
  <p class="note">Protótipo de uso interno. O conteúdo é criptografado e só abre com o e-mail de um integrante ativo e a senha individual dele. A sessão termina ao sair, ao fechar ou recarregar a aba, após 30 minutos sem uso ou após 8 horas.</p>
</main>
<script>
"use strict";
const DATA = { iv: "${b64(iv)}", iterations: ${ITERATIONS}, cipher: "${b64(cipher)}", users: ${JSON.stringify(USERS)} };
const u8 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const te = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
// Bloqueio após tentativas: 5 erros seguidos travam o formulário por 5 minutos neste navegador.
const LOCK_KEY = "sptt.login", MAX = 5, LOCK_MS = 5 * 60 * 1000;
const lockState = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "{}"); } catch { return {}; } };
const setLock = (v) => { try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch {} };
const err = document.getElementById("err"), go = document.getElementById("go"), info = document.getElementById("info");
try { const m = sessionStorage.getItem("sptt.msg"); if (m) { info.textContent = m; info.hidden = false; sessionStorage.removeItem("sptt.msg"); } } catch {}
function lockedFor() { const st = lockState(); return st.until && st.until > Date.now() ? Math.ceil((st.until - Date.now()) / 60000) : 0; }
document.getElementById("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  err.textContent = "";
  const wait = lockedFor(); if (wait) { err.textContent = "Muitas tentativas. Tente de novo em " + wait + " min."; return; }
  if (!email || !password) { err.textContent = "Informe e-mail e senha."; return; }
  go.disabled = true; go.textContent = "Verificando…";
  try {
    const u = DATA.users[hex(await crypto.subtle.digest("SHA-256", te.encode("sptt:" + email)))];
    // Mesmo sem cadastro, faz a derivação completa: o tempo de resposta não revela se o e-mail existe.
    const rec = u || { s: btoa("0000000000000000"), i: btoa("000000000000"), w: btoa("x".repeat(48)) };
    const base = await crypto.subtle.importKey("raw", te.encode(email + "\\n" + password), "PBKDF2", false, ["deriveKey"]);
    const kek = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: u8(rec.s), iterations: DATA.iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u8(rec.i) }, kek, u8(rec.w));
    const ck = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const html = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u8(DATA.iv) }, ck, u8(DATA.cipher)));
    setLock({});
    // Sessão: o app recebe quem entrou e uma função para sair (volta a esta tela, sem nada decifrado).
    const boot = "<script>window.__SAFRA_LOGIN__=" + JSON.stringify(email) + ";window.__SAFRA_SESSION_START__=" + Date.now() + ";window.__SAFRA_LOGOUT__=function(m){try{sessionStorage.setItem('sptt.msg',m||'Você saiu.')}catch(e){}location.reload()};<\\/script>";
    document.open(); document.write(html.replace("<head>", "<head>" + boot)); document.close();
  } catch {
    const st = lockState(), n = (st.n || 0) + 1;
    setLock(n >= MAX ? { n: 0, until: Date.now() + LOCK_MS } : { n });
    err.textContent = n >= MAX ? "Muitas tentativas. Tente de novo em 5 min." : "E-mail ou senha incorretos.";
    go.disabled = false; go.textContent = "Entrar";
  }
});
</script>
</body>
</html>
`;

writeFileSync(output, shell);
console.log(`Gerado ${output}: ${emails.length} pessoas ativas com senha individual, ${(cipher.length / 1024).toFixed(2)} KB cifrados.`);
if (created.length) console.log(`Senhas provisórias criadas para ${created.length} pessoa(s), gravadas em ${secretsPath}.`);
