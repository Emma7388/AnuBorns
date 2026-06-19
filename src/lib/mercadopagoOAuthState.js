import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

const getStateSecret = () =>
  process.env.MERCADOPAGO_CLIENT_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "dev-mercadopago-oauth-state";

const base64UrlEncode = (value) => Buffer.from(value).toString("base64url");
const base64UrlDecode = (value) => Buffer.from(String(value ?? ""), "base64url").toString("utf8");

const signPayload = (payload) =>
  createHmac("sha256", getStateSecret()).update(payload).digest("base64url");

export const createMercadoPagoOAuthState = (userId) => {
  const payload = JSON.stringify({
    userId: String(userId ?? "").trim(),
    nonce: randomBytes(16).toString("hex"),
    iat: Date.now(),
  });
  const encoded = base64UrlEncode(payload);
  return `${encoded}.${signPayload(encoded)}`;
};

export const verifyMercadoPagoOAuthState = (state) => {
  const [encoded, signature] = String(state ?? "").split(".");
  if (!encoded || !signature) return { ok: false, error: "Estado OAuth inválido." };

  const expected = signPayload(encoded);
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return { ok: false, error: "Estado OAuth inválido." };
    }
  } catch {
    return { ok: false, error: "Estado OAuth inválido." };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    const userId = String(payload?.userId ?? "").trim();
    const issuedAt = Number(payload?.iat ?? 0);
    if (!userId || !Number.isFinite(issuedAt)) {
      return { ok: false, error: "Estado OAuth incompleto." };
    }
    if (Date.now() - issuedAt > STATE_TTL_MS) {
      return { ok: false, error: "Estado OAuth expirado." };
    }
    return { ok: true, userId };
  } catch {
    return { ok: false, error: "Estado OAuth inválido." };
  }
};
