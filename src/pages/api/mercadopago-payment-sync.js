/* API: sincroniza una orden al volver de Mercado Pago si el webhook aun no impacto. */
import { createInitialSaleDispatches } from "../../lib/saleDispatches.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

const statusMap = {
  approved: "approved",
  pending: "pending",
  in_process: "pending",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
};

const terminalStatuses = new Set(["approved", "rejected", "cancelled", "refunded"]);

const getSellerAccessTokenForOrder = async (supabaseAdmin, orderId) => {
  const safeOrderId = String(orderId ?? "").trim();
  if (!safeOrderId) return "";

  const { data: orderItems, error: itemsError } = await supabaseAdmin
    .from("order_items")
    .select("product_id")
    .eq("order_id", safeOrderId);

  if (itemsError) return "";

  const productIds = [
    ...new Set((orderItems ?? []).map((item) => String(item?.product_id ?? "").trim()).filter(Boolean)),
  ];
  if (productIds.length === 0) return "";

  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("user_id")
    .in("id", productIds);

  if (productsError) return "";

  const sellerIds = [
    ...new Set((products ?? []).map((product) => String(product?.user_id ?? "").trim()).filter(Boolean)),
  ];
  if (sellerIds.length !== 1) return "";

  const { data: account, error: accountError } = await supabaseAdmin
    .from("seller_mercadopago_accounts")
    .select("access_token")
    .eq("user_id", sellerIds[0])
    .maybeSingle();

  if (accountError) return "";
  return String(account?.access_token ?? "").trim();
};

const ensureApprovedOrderDispatches = async (supabaseAdmin, orderId) => {
  const dispatchResult = await createInitialSaleDispatches(supabaseAdmin, { orderId });
  return dispatchResult.ok;
};

const findApprovedProductConflicts = async (supabaseAdmin, orderId) => {
  const { data: orderItems, error: itemsError } = await supabaseAdmin
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);

  if (itemsError) return { ok: false, error: itemsError.message };

  const productIds = [
    ...new Set((orderItems ?? []).map((item) => String(item?.product_id ?? "").trim()).filter(Boolean)),
  ];
  if (productIds.length === 0) return { ok: true, conflicts: [] };

  const { data: approvedRows, error: approvedError } = await supabaseAdmin
    .from("order_items")
    .select("product_id, order_id, orders!inner(status)")
    .in("product_id", productIds)
    .eq("orders.status", "approved")
    .neq("order_id", orderId);

  if (approvedError) return { ok: false, error: approvedError.message };
  return { ok: true, conflicts: approvedRows ?? [] };
};

const getPaymentIdFromPayload = (payload = {}) => {
  const paymentId = String(payload?.payment_id ?? payload?.collection_id ?? payload?.paymentId ?? "").trim();
  return paymentId && paymentId !== "null" ? paymentId : "";
};

const getUniqueTokens = (tokens = []) => [
  ...new Set(tokens.map((token) => String(token ?? "").trim()).filter(Boolean)),
];

const fetchPaymentById = async (paymentAccessTokens, paymentId) => {
  for (const token of getUniqueTokens(paymentAccessTokens)) {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.ok) return { ok: true, payment: await response.json() };
  }
  return { ok: false };
};

const findPaymentByExternalReference = async (paymentAccessTokens, orderId) => {
  const url = new URL("https://api.mercadopago.com/v1/payments/search");
  url.searchParams.set("external_reference", orderId);
  url.searchParams.set("sort", "date_created");
  url.searchParams.set("criteria", "desc");
  url.searchParams.set("limit", "1");

  for (const token of getUniqueTokens(paymentAccessTokens)) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) continue;

    const payload = await response.json();
    const payment = Array.isArray(payload?.results) ? payload.results[0] : null;
    if (payment) return { ok: true, payment };
  }
  return { ok: false };
};

export const POST = async ({ request }) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ error: "Servicio no disponible." }), { status: 503 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado." }), { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sesion invalida." }), { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const orderId = String(payload?.orderId ?? "").trim();
    const paymentId = getPaymentIdFromPayload(payload);
    if (!orderId) {
      return new Response(JSON.stringify({ error: "Falta la orden." }), { status: 400 });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status, total_amount, currency, payment_id, payment_detail")
      .eq("id", orderId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Orden no encontrada." }), { status: 404 });
    }

    if (terminalStatuses.has(String(order.status ?? "").trim())) {
      if (order.status === "approved") {
        const dispatchesOk = await ensureApprovedOrderDispatches(supabaseAdmin, order.id);
        if (!dispatchesOk) {
          return new Response(JSON.stringify({ error: "No se pudo inicializar la venta." }), { status: 500 });
        }
      }
      return new Response(JSON.stringify({ ok: true, status: order.status }), { status: 200 });
    }

    const sellerAccessToken = await getSellerAccessTokenForOrder(supabaseAdmin, order.id);
    const paymentAccessTokens = [sellerAccessToken, accessToken];
    if (getUniqueTokens(paymentAccessTokens).length === 0) {
      return new Response(JSON.stringify({ error: "Falta configurar Mercado Pago." }), { status: 503 });
    }

    const paymentResult = paymentId
      ? await fetchPaymentById(paymentAccessTokens, paymentId)
      : await findPaymentByExternalReference(paymentAccessTokens, order.id);
    if (!paymentResult.ok) {
      return new Response(JSON.stringify({ error: "No se pudo validar el pago." }), { status: 502 });
    }

    const paymentData = paymentResult.payment;
    const resolvedPaymentId = String(paymentData?.id ?? paymentId).trim();
    const externalReference = String(paymentData?.external_reference ?? "").trim();
    if (externalReference && externalReference !== order.id) {
      return new Response(JSON.stringify({ error: "El pago no pertenece a esta orden." }), { status: 409 });
    }

    const paymentStatus = String(paymentData?.status ?? "").trim();
    const mappedStatus = statusMap[paymentStatus] ?? "pending";
    const paidAmount = Number(paymentData?.transaction_amount ?? 0);
    const expectedAmount = Number(order.total_amount ?? 0);
    const currencyId = String(paymentData?.currency_id ?? "").toUpperCase();
    const orderCurrency = String(order.currency ?? "").toUpperCase();
    const amountMatches = Number.isFinite(paidAmount) && Math.abs(paidAmount - expectedAmount) < 0.01;
    const currencyMatches = !orderCurrency || currencyId === orderCurrency;

    if (!amountMatches || !currencyMatches) {
      const reason = !amountMatches ? "amount_mismatch" : "currency_mismatch";
      await supabaseAdmin
        .from("orders")
        .update({
          status: "rejected",
          payment_status: paymentStatus,
          payment_id: resolvedPaymentId,
          payment_detail: reason,
        })
        .eq("id", order.id);
      return new Response(JSON.stringify({ ok: true, status: "rejected" }), { status: 200 });
    }

    if (mappedStatus === "approved") {
      const availability = await findApprovedProductConflicts(supabaseAdmin, order.id);
      if (!availability.ok) {
        return new Response(JSON.stringify({ error: "No se pudo validar disponibilidad." }), { status: 500 });
      }
      if (availability.conflicts.length > 0) {
        await supabaseAdmin
          .from("orders")
          .update({
            status: "rejected",
            payment_status: paymentStatus,
            payment_id: resolvedPaymentId,
            payment_detail: "product_already_sold",
          })
          .eq("id", order.id);
        return new Response(JSON.stringify({ ok: true, status: "rejected" }), { status: 200 });
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: mappedStatus,
        payment_status: paymentStatus,
        payment_id: resolvedPaymentId,
        payment_detail: paymentData?.status_detail ?? null,
      })
      .eq("id", order.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: "No se pudo actualizar la orden." }), { status: 500 });
    }

    if (mappedStatus === "approved") {
      const dispatchesOk = await ensureApprovedOrderDispatches(supabaseAdmin, order.id);
      if (!dispatchesOk) {
        return new Response(JSON.stringify({ error: "No se pudo inicializar la venta." }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ ok: true, status: mappedStatus }), { status: 200 });
  } catch (error) {
    console.error("[mp-payment-sync] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudo sincronizar el pago." }), { status: 500 });
  }
};
