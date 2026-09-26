const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const splitList = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const isTruthyEnv = (value) =>
  TRUE_VALUES.has(String(value ?? "").trim().toLowerCase());

export const getMercadoPagoDiagnosticsConfig = (env = process.env) => ({
  enabled: isTruthyEnv(env.MERCADOPAGO_DIAGNOSTIC_MODE),
  allowedSellerUserIds: splitList(env.MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS),
  allowedMpUserIds: splitList(env.MERCADOPAGO_DIAGNOSTIC_ALLOWED_MP_USER_IDS),
});

export const evaluateMercadoPagoDiagnosticPermission = ({
  sellerUserId = "",
  mpUserId = "",
  env = process.env,
} = {}) => {
  const config = getMercadoPagoDiagnosticsConfig(env);
  const safeSellerUserId = String(sellerUserId ?? "").trim();
  const safeMpUserId = String(mpUserId ?? "").trim();

  if (!config.enabled) {
    return {
      ok: false,
      reason: "diagnostic_mode_disabled",
      message: "Los diagnosticos de Mercado Pago estan deshabilitados.",
    };
  }

  if (!safeSellerUserId && !safeMpUserId) {
    return {
      ok: false,
      reason: "diagnostic_account_missing",
      message: "La prueba debe indicar explicitamente el vendedor o usuario Mercado Pago permitido.",
    };
  }

  const sellerAllowed =
    safeSellerUserId && config.allowedSellerUserIds.includes(safeSellerUserId);
  const mpUserAllowed =
    safeMpUserId && config.allowedMpUserIds.includes(safeMpUserId);

  if (!sellerAllowed && !mpUserAllowed) {
    return {
      ok: false,
      reason: "diagnostic_account_not_allowed",
      message: "La cuenta Mercado Pago no esta en la allowlist de diagnostico.",
    };
  }

  return {
    ok: true,
    reason: "diagnostic_account_allowed",
    message: "Cuenta habilitada explicitamente para diagnostico Mercado Pago.",
  };
};

export const assertMercadoPagoDiagnosticPermission = (options = {}) => {
  const permission = evaluateMercadoPagoDiagnosticPermission(options);
  if (!permission.ok) {
    const error = new Error(permission.message);
    error.code = permission.reason;
    throw error;
  }
  return permission;
};
