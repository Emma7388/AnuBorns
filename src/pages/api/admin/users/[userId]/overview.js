import { jsonResponse } from "../../../../../lib/apiResponse.js";
import { requireAdmin } from "../../../../../lib/adminAuth.js";
import { buildAdminUserOverview, getAdminMercadoPagoDiagnostic } from "../../../../../lib/adminUserOverview.js";
import { fetchMercadoPagoUser } from "../../../../../lib/mercadopagoIdentity.js";
import { checkRateLimit } from "../../../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../../../lib/supabaseServer.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ROWS = 200;

const clean = (value) => String(value ?? "").trim();
const formatMoney = (value, currency = "ARS") => ({ amount: Number(value) || 0, currency: clean(currency) || "ARS" });
const getItemTitle = (items) => {
  const names = (items ?? []).map((item) => clean(item?.name)).filter(Boolean);
  if (!names.length) return "Orden sin productos";
  return names.length === 1 ? names[0] : `${names[0]} y ${names.length - 1} más`;
};

const fetchProfile = async (supabaseAdmin, userId) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id,first_name,last_name,phone,dni,address,city,province,postal_code,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? {};
};

const fetchConnection = async (supabaseAdmin, userId) => {
  const { data, error } = await supabaseAdmin
    .from("seller_mercadopago_accounts")
    .select("user_id,mp_user_id,access_token,expires_at,connected_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
};

const fetchProducts = async (supabaseAdmin, userId) => {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id,title,price,currency,stock,publication_type,publication_status,publication_started_at,publication_expires_at,created_at,location,delivery_methods")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return data ?? [];
};

const fetchPublicationPayments = async (supabaseAdmin, userId) => {
  const { data, error } = await supabaseAdmin
    .from("product_publication_payments")
    .select("id,product_id,amount,currency,status,payment_status,payment_id,preference_id,payment_detail,approved_at,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return data ?? [];
};

const fetchPurchases = async (supabaseAdmin, userId) => {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id,status,payment_status,payment_id,preference_id,payment_detail,total_amount,currency,shipping_requested,shipping_status,created_at,order_items(name,qty,unit_price,provider,product_id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return (data ?? []).map((order) => ({
    id: clean(order.id),
    status: clean(order.status),
    payment_status: clean(order.payment_status),
    payment_id: clean(order.payment_id),
    preference_id: clean(order.preference_id),
    payment_detail: clean(order.payment_detail),
    ...formatMoney(order.total_amount, order.currency),
    shipping_requested: Boolean(order.shipping_requested),
    shipping_status: clean(order.shipping_status),
    created_at: order.created_at,
    display_name: getItemTitle(order.order_items),
    items: order.order_items ?? [],
  }));
};

const fetchSales = async (supabaseAdmin, userId) => {
  const { data, error } = await supabaseAdmin
    .from("order_items")
    .select("order_id,product_id,name,qty,unit_price,provider,orders!inner(id,user_id,status,payment_status,payment_id,payment_detail,currency,shipping_requested,shipping_status,created_at)")
    .eq("seller_user_id", userId)
    .order("created_at", { referencedTable: "orders", ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;

  const rows = data ?? [];
  const orderIds = [...new Set(rows.map((row) => clean(row?.order_id || row?.orders?.id)).filter(Boolean))];
  const dispatchMap = new Map();
  if (orderIds.length) {
    const { data: dispatches, error: dispatchError } = await supabaseAdmin
      .from("sale_dispatches")
      .select("order_id,product_id,fulfillment_status,dispatched_at,status_updated_at")
      .eq("seller_id", userId)
      .in("order_id", orderIds);
    if (dispatchError) throw dispatchError;
    for (const dispatch of dispatches ?? []) {
      dispatchMap.set(`${dispatch.order_id}::${dispatch.product_id}`, dispatch);
    }
  }

  return rows.map((row) => {
    const order = row.orders ?? {};
    const orderId = clean(row.order_id || order.id);
    const productId = clean(row.product_id);
    const dispatch = dispatchMap.get(`${orderId}::${productId}`) ?? {};
    return {
      order_id: orderId,
      product_id: productId,
      buyer_user_id: clean(order.user_id),
      display_name: clean(row.name) || "Producto",
      qty: Number(row.qty) || 1,
      ...formatMoney((Number(row.unit_price) || 0) * (Number(row.qty) || 1), order.currency),
      status: clean(order.status),
      payment_status: clean(order.payment_status),
      payment_id: clean(order.payment_id),
      payment_detail: clean(order.payment_detail),
      shipping_requested: Boolean(order.shipping_requested),
      shipping_status: clean(order.shipping_status),
      fulfillment_status: clean(dispatch.fulfillment_status) || (order.shipping_requested ? "requested" : "pickup_pending"),
      dispatched_at: dispatch.dispatched_at ?? null,
      status_updated_at: dispatch.status_updated_at ?? null,
      created_at: order.created_at,
    };
  });
};

const auditLabel = (event) => ({
  admin_profile_update: "Perfil actualizado por administración",
  admin_access_action_completed: "Acceso modificado por administración",
  admin_password_reset_requested: "Restablecimiento de cuenta enviado",
  order_payment_status_changed: "Estado de pago actualizado",
  manual_checkout_created: "Checkout manual creado",
}[event] ?? event.replaceAll("_", " "));

const fetchAudit = async (supabaseAdmin, userId) => {
  const [ownResult, adminResult] = await Promise.all([
    supabaseAdmin
      .from("audit_logs")
      .select("event,metadata,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabaseAdmin
      .from("audit_logs")
      .select("event,metadata,created_at")
      .ilike("event", "admin_%")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (ownResult.error) throw ownResult.error;
  if (adminResult.error) throw adminResult.error;
  const targeted = (adminResult.data ?? []).filter((row) => clean(row?.metadata?.target_user_id) === userId);
  const rows = [...(ownResult.data ?? []), ...targeted];
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.event}::${row.created_at}::${clean(row?.metadata?.action)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((row) => ({
    created_at: row.created_at,
    label: auditLabel(clean(row.event)),
    detail: clean(row?.metadata?.reason || row?.metadata?.action || row?.metadata?.status),
    status: clean(row?.metadata?.status),
  }));
};

/** @type {import("astro").APIRoute} */
export const GET = async ({ request, params }) => {
  try {
    const rate = await checkRateLimit({ request, routeKey: "admin-user-overview", windowMs: 60_000, max: 45 });
    if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);

    const userId = clean(params.userId);
    if (!UUID_PATTERN.test(userId)) return jsonResponse({ error: "El usuario no es válido." }, 400);
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);
    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const authResult = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authResult.error || !authResult.data?.user) return jsonResponse({ error: "Usuario no encontrado." }, 404);
    const authUser = authResult.data.user;

    const [profile, connection, products, publicationPayments, purchases, sales, audit] = await Promise.all([
      fetchProfile(supabaseAdmin, userId),
      fetchConnection(supabaseAdmin, userId),
      fetchProducts(supabaseAdmin, userId),
      fetchPublicationPayments(supabaseAdmin, userId),
      fetchPurchases(supabaseAdmin, userId),
      fetchSales(supabaseAdmin, userId),
      fetchAudit(supabaseAdmin, userId),
    ]);

    const productNames = new Map(products.map((product) => [clean(product.id), clean(product.title)]));
    const safePublicationPayments = publicationPayments.map((payment) => ({
      ...payment,
      product_title: productNames.get(clean(payment.product_id)) || "Publicación eliminada o histórica",
    }));
    let mpAccount = null;
    let liveError = "";
    if (connection?.access_token) {
      const fetched = await fetchMercadoPagoUser(connection.access_token);
      if (fetched.ok) mpAccount = fetched.account;
      else liveError = fetched.error || "mercadopago_unavailable";
    }

    return jsonResponse({
      ok: true,
      generated_at: new Date().toISOString(),
      mercado_pago: getAdminMercadoPagoDiagnostic({ connection, mpAccount, profile, authUser, liveError }),
      ...buildAdminUserOverview({
        products,
        publicationPayments: safePublicationPayments,
        purchases,
        sales,
        audit,
      }),
    });
  } catch (error) {
    console.error("[admin-user-overview] query failed", error?.message ?? error);
    return jsonResponse({ error: "No se pudo cargar la ficha integral del usuario." }, 500);
  }
};
