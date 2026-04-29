/* Rate limit en memoria para endpoints API (best-effort). */
const buckets = new Map();

const nowMs = () => Date.now();

const getClientIp = (request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
};

export const checkRateLimit = ({
  request,
  routeKey,
  windowMs = 60_000,
  max = 30,
}) => {
  const ip = getClientIp(request);
  const key = `${routeKey}:${ip}`;
  const current = buckets.get(key);
  const currentNow = nowMs();

  if (!current || currentNow - current.start > windowMs) {
    buckets.set(key, { start: currentNow, count: 1 });
    return { allowed: true, remaining: max - 1 };
  }

  if (current.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  current.count += 1;
  buckets.set(key, current);
  return { allowed: true, remaining: max - current.count };
};
