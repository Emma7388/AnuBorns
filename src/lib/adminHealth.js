const REQUIRED_ENV = [
  {
    key: "PUBLIC_SUPABASE_URL",
    area: "Supabase",
    label: "URL publica de Supabase",
    detail: "Necesaria para que el navegador use Supabase Auth y datos publicos.",
    secret: false,
  },
  {
    key: "PUBLIC_SUPABASE_ANON_KEY",
    area: "Supabase",
    label: "Anon key publica",
    detail: "Necesaria para sesiones del navegador. No es service role.",
    secret: false,
  },
  {
    key: "SUPABASE_URL",
    area: "Supabase",
    label: "URL server de Supabase",
    detail: "Necesaria para APIs internas y operaciones server-side.",
    secret: false,
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    area: "Supabase",
    label: "Service role server-side",
    detail: "Debe existir solo en backend/Vercel, nunca como PUBLIC_*.",
    secret: true,
  },
  {
    key: "SITE_URL",
    area: "Checkout",
    label: "URL publica del sitio",
    detail: "Mercado Pago la usa para volver al sitio y para webhooks.",
    secret: false,
  },
  {
    key: "MERCADOPAGO_ACCESS_TOKEN",
    area: "Mercado Pago",
    label: "Access token plataforma",
    detail: "Fallback server-side para consultar pagos y sincronizar estados.",
    secret: true,
  },
  {
    key: "MERCADOPAGO_WEBHOOK_SECRET",
    area: "Mercado Pago",
    label: "Webhook secret",
    detail: "Permite validar la firma de notificaciones Mercado Pago.",
    secret: true,
  },
  {
    key: "MERCADOPAGO_CLIENT_ID",
    area: "Mercado Pago OAuth",
    label: "Client ID OAuth",
    detail: "Necesario para conectar vendedores con Mercado Pago.",
    secret: false,
  },
  {
    key: "MERCADOPAGO_CLIENT_SECRET",
    area: "Mercado Pago OAuth",
    label: "Client secret OAuth",
    detail: "Necesario para refrescar tokens OAuth de vendedores.",
    secret: true,
  },
  {
    key: "MERCADOPAGO_OAUTH_REDIRECT_URI",
    area: "Mercado Pago OAuth",
    label: "Redirect URI OAuth",
    detail: "Debe coincidir con la app de Mercado Pago.",
    secret: false,
  },
];

export const ADMIN_HEALTH_TABLE_CHECKS = [
  {
    table: "admin_users",
    area: "Admin",
    label: "Permisos de administradores",
    select: "user_id",
    detail: "Habilita acceso al panel interno sin exponer service role.",
  },
  {
    table: "profiles",
    area: "Usuarios",
    label: "Perfiles privados",
    select: "user_id",
    detail: "Datos profundos de usuario: DNI, telefono, direccion y ciudad.",
  },
  {
    table: "products",
    area: "Catalogo",
    label: "Productos publicados",
    select: "id",
    detail: "Base del catalogo y del agrupado por vendedor.",
  },
  {
    table: "orders",
    area: "Compras",
    label: "Ordenes de compra",
    select: "id",
    detail: "Registra estados de pago, totales y datos de envio.",
  },
  {
    table: "order_items",
    area: "Compras",
    label: "Items de orden",
    select: "order_id",
    detail: "Une ordenes con productos vendidos y vendedor.",
  },
  {
    table: "seller_mercadopago_accounts",
    area: "Mercado Pago OAuth",
    label: "Cuentas MP de vendedores",
    select: "user_id",
    detail: "Guarda tokens OAuth de vendedores solo para backend.",
  },
  {
    table: "sale_dispatches",
    area: "Ventas",
    label: "Despachos de ventas",
    select: "id",
    detail: "Permite seguimiento de entrega/retiro despues del pago.",
  },
  {
    table: "purchase_status_reads",
    area: "Compras",
    label: "Lecturas de estado",
    select: "user_id",
    detail: "Evita repetir avisos de cambios de entrega al comprador.",
  },
  {
    table: "audit_logs",
    area: "Auditoria",
    label: "Registro de auditoria",
    select: "user_id",
    detail: "Traza eventos de seguridad, perfil y cambios de pago.",
  },
];

export const ADMIN_HEALTH_OPERATION_CHECKS = [
  {
    id: "admin-access",
    area: "Admin",
    label: "Acceso admin",
    detail: "La sesion actual paso la validacion server-side de administrador.",
  },
  {
    id: "supabase-server-client",
    area: "Supabase",
    label: "Cliente server Supabase",
    detail: "Las APIs pueden usar service role desde backend.",
  },
  {
    id: "checkout-pro",
    area: "Checkout",
    label: "Checkout Pro",
    detail: "Ordenes, items, SITE_URL y Mercado Pago listos para cobrar.",
  },
  {
    id: "seller-oauth",
    area: "Mercado Pago OAuth",
    label: "OAuth vendedores",
    detail: "La app tiene credenciales y tabla para tokens OAuth de vendedores.",
  },
  {
    id: "webhook",
    area: "Mercado Pago",
    label: "Webhook de pagos",
    detail: "La firma puede validarse y las tablas de ordenes existen.",
  },
  {
    id: "marketplace-fee",
    area: "Mercado Pago",
    label: "Comision marketplace",
    detail: "Controla marketplace_fee y evita enviar marketplace salvo confirmacion.",
  },
  {
    id: "multiseller-cart",
    area: "Carrito",
    label: "Carrito multiproveedor",
    detail: "El checkout debe finalizar un vendedor por vez y validar en servidor.",
  },
  {
    id: "audit",
    area: "Auditoria",
    label: "Trazabilidad",
    detail: "Los eventos criticos tienen tabla disponible para registro.",
  },
];

export const getEnvValue = (key) => {
  const env = import.meta.env ?? {};
  return process.env[key] ?? env[key] ?? "";
};

export const hasEnvValue = (key) => String(getEnvValue(key) ?? "").trim().length > 0;

export const buildHealthCheck = ({ id, area, label, status, detail, action = "", meta = {} }) => ({
  id,
  area,
  label,
  status,
  detail,
  action,
  meta,
});

export const evaluateEnvChecks = () =>
  REQUIRED_ENV.map((item) => {
    const present = hasEnvValue(item.key);
    return buildHealthCheck({
      id: `env-${item.key.toLowerCase()}`,
      area: item.area,
      label: item.label,
      status: present ? "ok" : "error",
      detail: present ? `${item.detail} Configurada.` : `${item.detail} Falta configurar ${item.key}.`,
      action: present ? "" : `Revisar ${item.key} en Vercel/local.`,
      meta: {
        key: item.key,
        present,
        secret: item.secret,
      },
    });
  });

export const evaluateSiteUrl = () => {
  const raw = String(getEnvValue("SITE_URL") ?? "").trim();
  if (!raw) {
    return buildHealthCheck({
      id: "site-url-valid",
      area: "Checkout",
      label: "SITE_URL HTTPS",
      status: "error",
      detail: "Falta SITE_URL. Checkout Pro necesita URLs publicas de retorno.",
      action: "Configurar SITE_URL con la URL publica HTTPS del sitio.",
    });
  }

  try {
    const url = new URL(raw);
    const isHttps = url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
    return buildHealthCheck({
      id: "site-url-valid",
      area: "Checkout",
      label: "SITE_URL HTTPS",
      status: isHttps ? "ok" : "error",
      detail: isHttps ? "SITE_URL tiene formato HTTPS valido." : "SITE_URL no tiene formato HTTPS valido.",
      action: isHttps ? "" : "Usar una URL HTTPS publica sin usuario ni password.",
    });
  } catch {
    return buildHealthCheck({
      id: "site-url-valid",
      area: "Checkout",
      label: "SITE_URL HTTPS",
      status: "error",
      detail: "SITE_URL no se puede leer como URL valida.",
      action: "Corregir SITE_URL en variables de entorno.",
    });
  }
};

export const evaluateMarketplaceConfig = () => {
  const fixedAmount = Number(getEnvValue("MERCADOPAGO_MARKETPLACE_FEE_AMOUNT") ?? 0);
  const percent = Number(getEnvValue("MERCADOPAGO_MARKETPLACE_FEE_PERCENT") ?? 0);
  const sendMarketplaceField = String(getEnvValue("MERCADOPAGO_SEND_MARKETPLACE_FIELD") ?? "false").toLowerCase() === "true";
  const marketplaceId = String(getEnvValue("MERCADOPAGO_MARKETPLACE_ID") ?? "").trim();
  const hasFee = (Number.isFinite(fixedAmount) && fixedAmount > 0) || (Number.isFinite(percent) && percent > 0);

  if (sendMarketplaceField) {
    return buildHealthCheck({
      id: "marketplace-field",
      area: "Mercado Pago",
      label: "Campo marketplace",
      status: marketplaceId ? "warning" : "error",
      detail: marketplaceId
        ? "MERCADOPAGO_SEND_MARKETPLACE_FIELD esta activo. Solo deberia estar asi si Mercado Pago lo confirmo."
        : "MERCADOPAGO_SEND_MARKETPLACE_FIELD esta activo pero falta MERCADOPAGO_MARKETPLACE_ID.",
      action: marketplaceId
        ? "Confirmar con Mercado Pago que corresponde enviar marketplace."
        : "Configurar MERCADOPAGO_MARKETPLACE_ID o apagar MERCADOPAGO_SEND_MARKETPLACE_FIELD.",
      meta: { fixedAmount, percent, sendMarketplaceField, hasFee },
    });
  }

  return buildHealthCheck({
    id: "marketplace-field",
    area: "Mercado Pago",
    label: "Campo marketplace",
    status: hasFee ? "ok" : "warning",
    detail: hasFee
      ? "La comision se enviara con marketplace_fee y el campo marketplace queda omitido."
      : "No hay comision marketplace configurada.",
    action: hasFee ? "" : "Si corresponde cobrar comision, revisar importe fijo o porcentaje en Vercel.",
    meta: { fixedAmount, percent, sendMarketplaceField, hasFee },
  });
};

export const summarizeHealth = (checks = []) => {
  const total = checks.length;
  const errors = checks.filter((check) => check.status === "error").length;
  const warnings = checks.filter((check) => check.status === "warning").length;
  return {
    total,
    ok: checks.filter((check) => check.status === "ok").length,
    warnings,
    errors,
    status: errors > 0 ? "error" : warnings > 0 ? "warning" : "ok",
  };
};
