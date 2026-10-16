/* Límite compartido entre instancias serverless, con respaldo local de despliegue. */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { getClientIp } from "./requestMeta.js";
import { getSupabaseAdmin } from "./supabaseServer.js";

const RATE_LIMIT_RPC = "consume_api_rate_limit";
const DISTRIBUTED_RETRY_MS = 30_000;
const EPHEMERAL_HASH_SECRET = randomBytes(32).toString("hex");
const buckets = new Map();

let distributedUnavailableUntil = 0;
let lastDistributedWarningAt = 0;

const nowMs = () => Date.now();
const clampInteger = (value, fallback, minimum, maximum) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
};

const getHashSecret = () => {
  const env = import.meta.env ?? {};
  return String(
    process.env.RATE_LIMIT_HASH_SECRET ??
    env.RATE_LIMIT_HASH_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    env.SUPABASE_SERVICE_ROLE_KEY ??
    EPHEMERAL_HASH_SECRET,
  ).trim();
};

const getRequestIdentity = (request) => {
  const ip = getClientIp(request);
  if (ip) return `ip:${ip}`;

  const authorization = String(request?.headers?.get("authorization") ?? "").trim();
  if (authorization) {
    return `auth:${createHash("sha256").update(authorization).digest("hex")}`;
  }
  return "unknown";
};

export const buildRateLimitKeyHash = ({ request, routeKey, secret = getHashSecret() }) => {
  const rawKey = `${String(routeKey ?? "unknown").trim() || "unknown"}:${getRequestIdentity(request)}`;
  return createHmac("sha256", secret || EPHEMERAL_HASH_SECRET).update(rawKey).digest("hex");
};

const checkMemoryRateLimit = ({ keyHash, windowMs, max, currentNow }) => {
  const current = buckets.get(keyHash);
  if (!current || currentNow - current.start >= windowMs) {
    buckets.set(keyHash, { start: currentNow, count: 1 });
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0, source: "memory-fallback" };
  }

  if (current.count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.start + windowMs - currentNow) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds, source: "memory-fallback" };
  }

  current.count += 1;
  buckets.set(keyHash, current);
  return { allowed: true, remaining: max - current.count, retryAfterSeconds: 0, source: "memory-fallback" };
};

const normalizeDistributedResult = (data) => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") return null;
  return {
    allowed: row.allowed,
    remaining: Math.max(0, Number(row.remaining) || 0),
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds) || 0),
    source: "distributed",
  };
};

const warnDistributedFallback = (error, currentNow) => {
  if (currentNow - lastDistributedWarningAt < DISTRIBUTED_RETRY_MS) return;
  lastDistributedWarningAt = currentNow;
  console.warn("[serverRateLimit] Distributed limiter unavailable; using memory fallback.", {
    code: String(error?.code ?? "unknown"),
  });
};

export const checkRateLimit = async ({
  request,
  routeKey,
  windowMs = 60_000,
  max = 30,
  adminClient,
  currentNow = nowMs(),
}) => {
  const safeWindowMs = clampInteger(windowMs, 60_000, 1_000, 86_400_000);
  const safeMax = clampInteger(max, 30, 1, 10_000);
  const keyHash = buildRateLimitKeyHash({ request, routeKey });
  const client = adminClient === undefined ? getSupabaseAdmin() : adminClient;

  if (client && currentNow >= distributedUnavailableUntil) {
    try {
      const { data, error } = await client.rpc(RATE_LIMIT_RPC, {
        p_key_hash: keyHash,
        p_limit: safeMax,
        p_window_seconds: Math.max(1, Math.ceil(safeWindowMs / 1000)),
      });
      if (error) throw error;
      const result = normalizeDistributedResult(data);
      if (!result) throw Object.assign(new Error("invalid_rate_limit_response"), { code: "invalid_response" });
      distributedUnavailableUntil = 0;
      return result;
    } catch (error) {
      distributedUnavailableUntil = currentNow + DISTRIBUTED_RETRY_MS;
      warnDistributedFallback(error, currentNow);
    }
  }

  return checkMemoryRateLimit({
    keyHash,
    windowMs: safeWindowMs,
    max: safeMax,
    currentNow,
  });
};

export const resetRateLimitStateForTests = () => {
  buckets.clear();
  distributedUnavailableUntil = 0;
  lastDistributedWarningAt = 0;
};
