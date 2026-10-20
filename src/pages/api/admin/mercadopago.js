import { jsonResponse } from "../../../lib/apiResponse.js";
import { requireAdmin } from "../../../lib/adminAuth.js";
import { buildAdminMercadoPagoSnapshot } from "../../../lib/adminMercadoPago.js";
import { fetchMercadoPagoUser } from "../../../lib/mercadopagoIdentity.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";
import { decryptMercadoPagoAccount } from "../../../lib/mercadopagoTokenCrypto.js";

const MAX_ROWS = 1000;
const LIVE_CONCURRENCY = 3;

const clean = (value) => String(value ?? "").trim();
const unique = (values) => Array.from(new Set(values.map(clean).filter(Boolean)));

const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

const listAuthUsers = async (supabaseAdmin) => {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: MAX_ROWS });
  if (error) throw error;
  return data?.users ?? [];
};

const fetchProfiles = async (supabaseAdmin, userIds) => {
  if (!userIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id,first_name,last_name,dni")
    .in("user_id", userIds.slice(0, MAX_ROWS));
  if (error) throw error;
  return data ?? [];
};

const buildPendingOrders = (rows) => {
  const orders = new Map();
  for (const row of rows ?? []) {
    const order = row?.orders ?? {};
    const sellerId = clean(row?.seller_user_id);
    const orderId = clean(row?.order_id || order?.id);
    if (!sellerId || !orderId) continue;
    const key = `${sellerId}::${orderId}`;
    const current = orders.get(key) ?? {
      seller_user_id: sellerId,
      order_id: orderId,
      status: clean(order?.status),
      payment_status: clean(order?.payment_status),
      payment_id: clean(order?.payment_id),
      preference_id: clean(order?.preference_id),
      total_amount: Number(order?.total_amount) || 0,
      currency: clean(order?.currency) || "ARS",
      created_at: order?.created_at ?? null,
      products: [],
    };
    current.products.push({ name: clean(row?.name) || "Producto", qty: Number(row?.qty) || 1 });
    orders.set(key, current);
  }
  return [...orders.values()];
};

const verifyPayment = async (order, accountMap) => {
  const account = accountMap.get(clean(order?.seller_user_id));
  if (!account?.access_token) return { order_id: order.order_id, ok: false, error: "missing_access_token" };
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(order.order_id)}&sort=date_created&criteria=desc`, {
      headers: { Authorization: `Bearer ${account.access_token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { order_id: order.order_id, ok: false, error: clean(payload?.message) || `HTTP ${response.status}` };
    const payment = payload?.results?.[0] ?? null;
    return {
      order_id: order.order_id,
      ok: true,
      payment: payment ? {
        id: clean(payment.id),
        status: clean(payment.status),
        status_detail: clean(payment.status_detail),
      } : null,
    };
  } catch {
    return { order_id: order.order_id, ok: false, error: "mercadopago_unavailable" };
  }
};

/** @type {import("astro").APIRoute} */
export const GET = async ({ request, url }) => {
  try {
    const verifyLive = url.searchParams.get("verify") === "1";
    const rate = await checkRateLimit({
      request,
      routeKey: verifyLive ? "admin-mercadopago-live" : "admin-mercadopago",
      windowMs: 60_000,
      max: verifyLive ? 6 : 30,
    });
    if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);
    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const [accountsResult, productsResult, salesResult, pendingResult, authUsers] = await Promise.all([
      supabaseAdmin
        .from("seller_mercadopago_accounts")
        .select("user_id,mp_user_id,access_token,refresh_token,expires_at,connected_at,updated_at")
        .limit(MAX_ROWS),
      supabaseAdmin.from("products").select("user_id").limit(MAX_ROWS),
      supabaseAdmin.from("order_items").select("seller_user_id,order_id").not("seller_user_id", "is", null).limit(MAX_ROWS),
      supabaseAdmin
        .from("order_items")
        .select("seller_user_id,order_id,name,qty,orders!inner(id,status,payment_status,payment_id,preference_id,total_amount,currency,created_at)")
        .not("seller_user_id", "is", null)
        .eq("orders.status", "pending")
        .order("created_at", { referencedTable: "orders", ascending: false })
        .limit(MAX_ROWS),
      listAuthUsers(supabaseAdmin),
    ]);

    const queryResults = [accountsResult, productsResult, salesResult, pendingResult];
    const failed = queryResults.find((result) => result.error);
    if (failed?.error) {
      console.error("[admin-mercadopago] query failed", failed.error.message);
      return jsonResponse({ error: "No se pudo construir el control de Mercado Pago." }, 500);
    }

    const storedAccounts = accountsResult.data ?? [];
    const rawAccounts = storedAccounts.map(decryptMercadoPagoAccount);
    const products = productsResult.data ?? [];
    const sales = salesResult.data ?? [];
    const pendingOrders = buildPendingOrders(pendingResult.data ?? []);
    const sellerIds = unique([
      ...rawAccounts.map((row) => row.user_id),
      ...products.map((row) => row.user_id),
      ...sales.map((row) => row.seller_user_id),
    ]);
    const profiles = await fetchProfiles(supabaseAdmin, sellerIds);
    const profileMap = new Map(profiles.map((row) => [clean(row.user_id), row]));
    const authMap = new Map(authUsers.map((user) => [clean(user.id), user]));
    const productCounts = new Map();
    const saleOrdersBySeller = new Map();
    for (const row of products) productCounts.set(clean(row.user_id), (productCounts.get(clean(row.user_id)) ?? 0) + 1);
    for (const row of sales) {
      const sellerId = clean(row.seller_user_id);
      if (!sellerId) continue;
      const orderIds = saleOrdersBySeller.get(sellerId) ?? new Set();
      orderIds.add(clean(row.order_id) || `item-${orderIds.size}`);
      saleOrdersBySeller.set(sellerId, orderIds);
    }

    const sellers = sellerIds.map((userId) => {
      const profile = profileMap.get(userId) ?? {};
      const authUser = authMap.get(userId) ?? {};
      const label = [profile.first_name, profile.last_name].map(clean).filter(Boolean).join(" ") || clean(authUser.email) || "Vendedor";
      return {
        user_id: userId,
        label,
        email: clean(authUser.email),
        products_count: productCounts.get(userId) ?? 0,
        sales_count: saleOrdersBySeller.get(userId)?.size ?? 0,
        profile,
        auth_user: authUser,
      };
    });

    const accountMap = new Map(rawAccounts.map((row) => [clean(row.user_id), row]));
    let liveIdentities = [];
    let paymentChecks = [];
    if (verifyLive) {
      liveIdentities = await mapWithConcurrency(rawAccounts, LIVE_CONCURRENCY, async (account) => {
        const result = await fetchMercadoPagoUser(account.access_token);
        return { user_id: clean(account.user_id), ...result };
      });
      paymentChecks = await mapWithConcurrency(pendingOrders, LIVE_CONCURRENCY, (order) => verifyPayment(order, accountMap));
    }

    const safeAccounts = rawAccounts.map((account) => ({
      user_id: clean(account.user_id),
      mp_user_id: clean(account.mp_user_id),
      has_access_token: Boolean(clean(account.access_token)),
      has_refresh_token: Boolean(clean(account.refresh_token)),
      expires_at: account.expires_at ?? null,
      connected_at: account.connected_at ?? null,
      updated_at: account.updated_at ?? null,
    }));

    return jsonResponse({
      ok: true,
      generated_at: new Date().toISOString(),
      limits: { rows: MAX_ROWS, live_concurrency: LIVE_CONCURRENCY },
      ...buildAdminMercadoPagoSnapshot({
        sellers,
        accounts: safeAccounts,
        pendingOrders,
        liveIdentities,
        paymentChecks,
        verificationMode: verifyLive ? "live" : "local",
      }),
    });
  } catch (error) {
    console.error("[admin-mercadopago] unhandled error", error?.message ?? error);
    return jsonResponse({ error: "No se pudo cargar el control de Mercado Pago." }, 500);
  }
};
