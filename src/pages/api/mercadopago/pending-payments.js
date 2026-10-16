import { jsonResponse } from "../../../lib/apiResponse.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getAuthenticatedUser } from "../../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";

const PENDING_STATUSES = new Set(["pending", "in_process", "in_mediation", "authorized"]);

export const GET = async ({ request }) => {
  const rate = await checkRateLimit({ request, routeKey: "seller-pending-payments", windowMs: 60_000, max: 20 });
  if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes." }, 429);
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);
  const auth = await getAuthenticatedUser(supabaseAdmin, request);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const [{ data: account }, { data: rows, error: rowsError }] = await Promise.all([
    supabaseAdmin.from("seller_mercadopago_accounts").select("access_token,mp_user_id").eq("user_id", auth.user.id).maybeSingle(),
    supabaseAdmin.from("order_items")
      .select("order_id,name,qty,unit_price,orders!inner(id,status,payment_status,payment_id,preference_id,total_amount,currency,created_at)")
      .eq("seller_user_id", auth.user.id)
      .eq("orders.status", "pending")
      .order("created_at", { referencedTable: "orders", ascending: false })
      .limit(30),
  ]);
  if (rowsError) return jsonResponse({ error: "No se pudieron consultar los pagos pendientes." }, 500);
  if (!account?.access_token) return jsonResponse({ items: [], connected: false });

  const orders = new Map();
  (rows ?? []).forEach((row) => {
    const order = row.orders;
    if (!order?.id) return;
    const current = orders.get(order.id) ?? { ...order, products: [] };
    current.products.push({ name: row.name, qty: row.qty, unit_price: row.unit_price });
    orders.set(order.id, current);
  });
  const items = await Promise.all([...orders.values()].map(async (order) => {
    try {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc`, {
        headers: { Authorization: `Bearer ${account.access_token}` },
        signal: AbortSignal.timeout(8_000),
      });
      const payload = await response.json().catch(() => ({}));
      const payment = response.ok ? payload?.results?.[0] : null;
      const mpStatus = String(payment?.status ?? "").toLowerCase();
      return {
        order_id: order.id,
        created_at: order.created_at,
        total_amount: order.total_amount,
        currency: order.currency,
        preference_id: order.preference_id,
        payment_id: payment?.id ? String(payment.id) : order.payment_id,
        payment_status: mpStatus || order.payment_status,
        kind: payment ? (PENDING_STATUSES.has(mpStatus) ? "mercadopago_pending" : "mercadopago_resolved") : "preference_only",
        products: order.products,
      };
    } catch {
      return { ...order, order_id: order.id, kind: "verification_unavailable", products: order.products };
    }
  }));
  return jsonResponse({ connected: true, items });
};
