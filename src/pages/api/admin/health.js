import { jsonResponse } from "../../../lib/apiResponse.js";
import { requireAdmin } from "../../../lib/adminAuth.js";
import {
  ADMIN_HEALTH_OPERATION_CHECKS,
  ADMIN_HEALTH_TABLE_CHECKS,
  buildHealthCheck,
  evaluateEnvChecks,
  evaluateMarketplaceConfig,
  evaluateSiteUrl,
  hasEnvValue,
  summarizeHealth,
} from "../../../lib/adminHealth.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin, getSupabaseAdminConfigStatus } from "../../../lib/supabaseServer.js";

const tableCheckToHealth = async (supabaseAdmin, tableCheck) => {
  try {
    const { error, count } = await supabaseAdmin
      .from(tableCheck.table)
      .select(tableCheck.select, { count: "exact", head: true });

    if (error) {
      return buildHealthCheck({
        id: `table-${tableCheck.table}`,
        area: tableCheck.area,
        label: tableCheck.label,
        status: "error",
        detail: `${tableCheck.detail} No se pudo leer la tabla ${tableCheck.table}.`,
        action: `Revisar schema/RLS/permisos de ${tableCheck.table}.`,
        meta: { table: tableCheck.table, error: error.message },
      });
    }

    return buildHealthCheck({
      id: `table-${tableCheck.table}`,
      area: tableCheck.area,
      label: tableCheck.label,
      status: "ok",
      detail: `${tableCheck.detail} Tabla disponible.`,
      meta: { table: tableCheck.table, count: count ?? null },
    });
  } catch (error) {
    return buildHealthCheck({
      id: `table-${tableCheck.table}`,
      area: tableCheck.area,
      label: tableCheck.label,
      status: "error",
      detail: `${tableCheck.detail} Fallo inesperado al validar la tabla.`,
      action: `Revisar ${tableCheck.table} en Supabase.`,
      meta: { table: tableCheck.table, error: String(error?.message ?? error) },
    });
  }
};

const getCheck = (checks, id) => checks.find((check) => check.id === id);
const isOk = (checks, id) => getCheck(checks, id)?.status === "ok";
const tableOk = (checks, table) => isOk(checks, `table-${table}`);

const buildOperationChecks = ({ envChecks, tableChecks, supabaseConfigured, supabaseAdmin }) => {
  const operationChecks = [];
  const envOk = (key) => isOk(envChecks, `env-${key.toLowerCase()}`);

  operationChecks.push(buildHealthCheck({
    ...ADMIN_HEALTH_OPERATION_CHECKS.find((check) => check.id === "admin-access"),
    status: "ok",
    detail: "La sesion actual paso la validacion server-side de administrador.",
  }));

  operationChecks.push(buildHealthCheck({
    ...ADMIN_HEALTH_OPERATION_CHECKS.find((check) => check.id === "supabase-server-client"),
    status: supabaseConfigured && Boolean(supabaseAdmin) ? "ok" : "error",
    detail: supabaseConfigured && Boolean(supabaseAdmin)
      ? "Cliente server Supabase disponible."
      : "Falta configuracion server de Supabase.",
    action: supabaseConfigured && Boolean(supabaseAdmin)
      ? ""
      : "Revisar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
  }));

  const checkoutReady =
    envOk("SITE_URL") &&
    envOk("MERCADOPAGO_ACCESS_TOKEN") &&
    tableOk(tableChecks, "orders") &&
    tableOk(tableChecks, "order_items") &&
    tableOk(tableChecks, "products") &&
    tableOk(tableChecks, "seller_mercadopago_accounts");
  operationChecks.push(buildHealthCheck({
    ...ADMIN_HEALTH_OPERATION_CHECKS.find((check) => check.id === "checkout-pro"),
    status: checkoutReady ? "ok" : "error",
    detail: checkoutReady
      ? "Checkout Pro tiene las piezas minimas disponibles."
      : "Checkout Pro no tiene todas las piezas minimas disponibles.",
    action: checkoutReady ? "" : "Revisar SITE_URL, Mercado Pago, orders, order_items, products y cuentas OAuth.",
  }));

  const sellerOAuthReady =
    envOk("MERCADOPAGO_CLIENT_ID") &&
    envOk("MERCADOPAGO_CLIENT_SECRET") &&
    envOk("MERCADOPAGO_OAUTH_REDIRECT_URI") &&
    tableOk(tableChecks, "seller_mercadopago_accounts");
  operationChecks.push(buildHealthCheck({
    ...ADMIN_HEALTH_OPERATION_CHECKS.find((check) => check.id === "seller-oauth"),
    status: sellerOAuthReady ? "ok" : "error",
    detail: sellerOAuthReady
      ? "OAuth de vendedores tiene credenciales y tabla disponible."
      : "OAuth de vendedores esta incompleto.",
    action: sellerOAuthReady ? "" : "Revisar credenciales OAuth y tabla seller_mercadopago_accounts.",
  }));

  const webhookReady =
    envOk("MERCADOPAGO_WEBHOOK_SECRET") &&
    envOk("MERCADOPAGO_ACCESS_TOKEN") &&
    tableOk(tableChecks, "orders") &&
    tableOk(tableChecks, "order_items") &&
    tableOk(tableChecks, "audit_logs");
  operationChecks.push(buildHealthCheck({
    ...ADMIN_HEALTH_OPERATION_CHECKS.find((check) => check.id === "webhook"),
    status: webhookReady ? "ok" : "error",
    detail: webhookReady
      ? "Webhook de pagos puede validar firma e impactar ordenes."
      : "Webhook de pagos tiene piezas faltantes.",
    action: webhookReady ? "" : "Revisar webhook secret, access token y tablas de orden/auditoria.",
  }));

  operationChecks.push(evaluateMarketplaceConfig());

  const multisellerReady =
    tableOk(tableChecks, "products") &&
    tableOk(tableChecks, "orders") &&
    tableOk(tableChecks, "order_items");
  operationChecks.push(buildHealthCheck({
    ...ADMIN_HEALTH_OPERATION_CHECKS.find((check) => check.id === "multiseller-cart"),
    status: multisellerReady ? "ok" : "error",
    detail: multisellerReady
      ? "Carrito multiproveedor puede validar productos y finalizar por vendedor."
      : "Faltan tablas para validar compra por vendedor.",
    action: multisellerReady ? "" : "Revisar products, orders y order_items.",
  }));

  operationChecks.push(buildHealthCheck({
    ...ADMIN_HEALTH_OPERATION_CHECKS.find((check) => check.id === "audit"),
    status: tableOk(tableChecks, "audit_logs") ? "ok" : "error",
    detail: tableOk(tableChecks, "audit_logs")
      ? "Tabla de auditoria disponible."
      : "La tabla de auditoria no esta disponible.",
    action: tableOk(tableChecks, "audit_logs") ? "" : "Ejecutar/revisar docs/audit-log.sql.",
  }));

  return operationChecks;
};

/** @type {import("astro").APIRoute} */
export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "admin-health",
      windowMs: 60_000,
      max: 60,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);
    }

    const config = getSupabaseAdminConfigStatus();
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const envChecks = [...evaluateEnvChecks(), evaluateSiteUrl()];
    const tableChecks = await Promise.all(
      ADMIN_HEALTH_TABLE_CHECKS.map((tableCheck) => tableCheckToHealth(supabaseAdmin, tableCheck)),
    );
    const operationChecks = buildOperationChecks({
      envChecks,
      tableChecks,
      supabaseConfigured: config.missing.length === 0,
      supabaseAdmin,
    });
    const checks = [...operationChecks, ...tableChecks, ...envChecks];

    return jsonResponse({
      ok: true,
      generated_at: new Date().toISOString(),
      summary: summarizeHealth(checks),
      checks,
      notes: [
        "Este panel refleja la configuracion y base conectadas al entorno actual.",
        "No muestra valores secretos ni confirma variables de Vercel si estas probando en local.",
        hasEnvValue("MERCADOPAGO_SEND_MARKETPLACE_FIELD")
          ? "El campo marketplace solo debe enviarse si Mercado Pago lo confirmo explicitamente."
          : "MERCADOPAGO_SEND_MARKETPLACE_FIELD ausente se interpreta como false en checkout.",
      ],
    });
  } catch (error) {
    console.error("[admin-health] Unhandled error", error);
    return jsonResponse({ error: "No se pudo cargar el estado operativo." }, 500);
  }
};
