import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const loadDotEnvFile = (filename) => {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
};

loadDotEnvFile(".env");
loadDotEnvFile(".env.local");

const requiredPublicEnv = [
  "PUBLIC_SUPABASE_URL",
  "PUBLIC_SUPABASE_ANON_KEY",
];

const requiredServerEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missing = [...requiredPublicEnv, ...requiredServerEnv].filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error(
    [
      "Missing required Supabase environment variables:",
      ...missing.map((key) => `- ${key}`),
      "",
      "Add them in Vercel Project Settings > Environment Variables for Production, then redeploy.",
    ].join("\n"),
  );
  process.exit(1);
}
