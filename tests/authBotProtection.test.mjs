import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

test("registro, login y recuperación entregan captchaToken a Supabase", async () => {
  const [login, register] = await Promise.all([
    read("src/scripts/login.js"),
    read("src/scripts/register.js"),
  ]);

  assert.match(login, /signInWithPassword[\s\S]*captchaToken:\s*captcha\.token/);
  assert.match(login, /resetPasswordForEmail[\s\S]*captchaToken:\s*captcha\.token/);
  assert.match(register, /signUp[\s\S]*captchaToken:\s*captcha\.token/);
});

test("la CSP sólo habilita el dominio de Turnstile para script, frame y conexión", async () => {
  const config = await read("astro.config.mjs");
  assert.match(config, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.match(config, /connect-src[^\n]+https:\/\/challenges\.cloudflare\.com/);
  assert.match(config, /resource:\s*"https:\/\/challenges\.cloudflare\.com"/);
  assert.doesNotMatch(config, /script-src[^\n]*'unsafe-inline'/);
});
