import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "mpenc:v1";
const TOKEN_AAD = Buffer.from("anuborns:mercadopago-oauth-token:v1", "utf8");

const readEncryptionKey = () => {
  const raw = String(process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY ?? "").trim();
  if (!raw) throw new Error("mercadopago_token_encryption_key_missing");

  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else {
    try {
      key = Buffer.from(raw, "base64url");
    } catch {
      key = Buffer.alloc(0);
    }
  }
  if (key.length !== 32) throw new Error("mercadopago_token_encryption_key_invalid");
  return key;
};

export const getMercadoPagoTokenEncryptionStatus = () => {
  try {
    readEncryptionKey();
    return { configured: true, valid: true };
  } catch (error) {
    return {
      configured: error?.message !== "mercadopago_token_encryption_key_missing",
      valid: false,
      error: String(error?.message ?? "mercadopago_token_encryption_key_invalid"),
    };
  }
};

export const isEncryptedMercadoPagoToken = (value) =>
  String(value ?? "").startsWith(`${TOKEN_PREFIX}:`);

export const encryptMercadoPagoToken = (value) => {
  const plainText = String(value ?? "").trim();
  if (!plainText) return null;
  if (isEncryptedMercadoPagoToken(plainText)) return plainText;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", readEncryptionKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
};

export const decryptMercadoPagoToken = (value) => {
  const stored = String(value ?? "").trim();
  if (!stored || !isEncryptedMercadoPagoToken(stored)) return stored;

  const parts = stored.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== TOKEN_PREFIX) {
    throw new Error("mercadopago_token_ciphertext_invalid");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", readEncryptionKey(), Buffer.from(parts[2], "base64url"));
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[4], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (String(error?.message ?? "").startsWith("mercadopago_token_encryption_key_")) throw error;
    throw new Error("mercadopago_token_decryption_failed");
  }
};

export const decryptMercadoPagoAccount = (account) => {
  if (!account) return account;
  return {
    ...account,
    access_token: decryptMercadoPagoToken(account.access_token),
    refresh_token: decryptMercadoPagoToken(account.refresh_token),
  };
};

export const encryptMercadoPagoAccountTokens = (account) => ({
  access_token: encryptMercadoPagoToken(account?.access_token),
  refresh_token: encryptMercadoPagoToken(account?.refresh_token),
});
