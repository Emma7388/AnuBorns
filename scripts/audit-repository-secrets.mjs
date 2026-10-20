import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_ENV_FILES = new Set([".env.example"]);

const SECRET_PATTERNS = [
  { id: "private-key", pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { id: "mercadopago-access-token", pattern: /\bAPP_USR-[A-Za-z0-9_-]{20,}\b/ },
  { id: "supabase-secret-key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  { id: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/ },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { id: "vercel-token", pattern: /\bvercel_[A-Za-z0-9_-]{20,}\b/ },
  {
    id: "database-url-with-password",
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@[^\s]+/i,
  },
];

const normalizePath = (filePath) => filePath.replaceAll("\\", "/");

export const isForbiddenEnvironmentFile = (filePath) => {
  const normalized = normalizePath(filePath);
  const basename = normalized.split("/").at(-1) ?? "";
  return (basename === ".env" || basename.startsWith(".env.")) && !ALLOWED_ENV_FILES.has(basename);
};

const decodeJwtPayload = (token) => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return null;
  }
};

export const scanTextForSecrets = (text) => {
  const findings = [];
  const lines = String(text).split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const { id, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) findings.push({ rule: id, line: index + 1 });
    }

    for (const match of line.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g)) {
      if (decodeJwtPayload(match[0])?.role === "service_role") {
        findings.push({ rule: "supabase-service-role-jwt", line: index + 1 });
      }
    }
  });

  return findings;
};

const listTrackedFiles = () => {
  const output = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return output.split("\0").filter(Boolean);
};

const auditTrackedFiles = async () => {
  const findings = [];

  for (const filePath of listTrackedFiles()) {
    if (isForbiddenEnvironmentFile(filePath)) {
      findings.push({ file: filePath, rule: "tracked-environment-file" });
      continue;
    }

    let buffer;
    try {
      buffer = await readFile(filePath);
    } catch (error) {
      // Un archivo eliminado sigue apareciendo en el índice hasta el próximo commit.
      if (error?.code === "ENOENT") continue;
      findings.push({ file: filePath, rule: "unreadable-tracked-file" });
      continue;
    }

    if (buffer.length > MAX_TEXT_FILE_BYTES || buffer.includes(0)) continue;
    for (const finding of scanTextForSecrets(buffer.toString("utf8"))) {
      findings.push({ file: filePath, ...finding });
    }
  }

  return findings;
};

const main = async () => {
  const findings = await auditTrackedFiles();
  if (findings.length === 0) {
    console.log("Secretos: sin hallazgos en archivos versionados.");
    return;
  }

  console.error(`Secretos: ${findings.length} hallazgo(s). No se muestran valores.`);
  findings.forEach(({ file, line, rule }) => {
    console.error(`- ${file}${line ? `:${line}` : ""} [${rule}]`);
  });
  process.exitCode = 1;
};

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) await main();
