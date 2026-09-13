/* API: sincroniza una orden al volver de Mercado Pago si el webhook aun no impacto. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getUniqueStringIds } from "../../lib/orderInput.js";
import { createInitialSaleDispatches } from "../../lib/saleDispatches.js";
import {
  PRODUCT_LOCKING_ORDER_STATUSES,
  getInternalPaymentStatusFromMercadoPago,
  mergeMercadoPagoPaymentDetail,
} from "../../lib/paymentStatus.js";
import { recordOrderPaymentMovement } from "../../lib/paymentMovement.js";
import { readJsonBody } from "../../lib/serverRequest.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MERCADOPAGO_REQUEST_TIMEOUT_MS = 8_000;

const terminalStatuses = new Set(["approved", "rejected", "cancelled", "refunded", "partially_refunded"]);

const getSellerAccessTokenForOrder = async (supabaseAdmin, orderId) => {
  const safeOrderId = String(orderId ?? "").trim();
  if (!safeOrderId) return "";

  const { data: orderItems, error: itemsError } = await supabaseAdmin
    .from("order_items")
    .select("product_id")
    .eq("order_id", safeOrderId);

  if (itemsError) return "";

  const productIds = getUniqueStringIds((orderItems ?? []).map((item) => item?.product_id));
  if (productIds.length === 0) return "";

  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("user_id")
    .in("id", productIds);

  if (productsError) return "";

  const sellerIds = getUniqueStringIds((products ?? []).map((product) => product?.user_id));
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
    .in("orders.status", [...PRODUCT_LOCKING_ORDER_STATUSES])
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
    try {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(MERCADOPAGO_REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return { ok: true, payment: await response.json() };
    } catch {
      // Prueba el siguiente token disponible; si no hay, devuelve un 502 controlado.
    }
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
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(MERCADOPAGO_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) continue;

      const payload = await response.json();
      const payment = Array.isArray(payload?.results) ? payload.results[0] : null;
      if (payment) return { ok: true, payment };
    } catch {
      // Prueba el siguiente token disponible; si no hay, devuelve un 502 controlado.
    }
  }
  return { ok: false };
};

export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "mp-payment-sync",
      windowMs: 60_000,
      max: 30,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonResponse({ error: "Servicio no disponible." }, 503);
    }

    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const body = await readJsonBody(request, { maxBytes: 8_000 });
    if (!body.ok) return jsonResponse({ error: body.error }, body.status);
    const payload = body.data;
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "El detalle de sincronización no es válido." }, 400);
    }
    const orderId = String(payload?.orderId ?? "").trim();
    const paymentId = getPaymentIdFromPayload(payload);
    if (!orderId) {
      return jsonResponse({ error: "Falta la orden." }, 400);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status, total_amount, currency, payment_id, payment_status, payment_detail")
      .eq("id", orderId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (orderError || !order) {
      return jsonResponse({ error: "Orden no encontrada." }, 404);
    }

    const sellerAccessToken = await getSellerAccessTokenForOrder(supabaseAdmin, order.id);
    const paymentAccessTokens = [sellerAccessToken, accessToken];
    if (getUniqueTokens(paymentAccessTokens).length === 0) {
      return jsonResponse({ error: "Falta configurar Mercado Pago." }, 503);
    }

    const paymentResult = paymentId
      ? await fetchPaymentById(paymentAccessTokens, paymentId)
      : await findPaymentByExternalReference(paymentAccessTokens, order.id);
    if (!paymentResult.ok) {
      return jsonResponse({ error: "No se pudo validar el pago." }, 502);
    }

    const paymentData = paymentResult.payment;
    const resolvedPaymentId = String(paymentData?.id ?? paymentId).trim();
    const externalReference = String(paymentData?.external_reference ?? "").trim();
    if (externalReference && externalReference !== order.id) {
      return jsonResponse({ error: "El pago no pertenece a esta orden." }, 409);
    }

    const paymentStatus = String(paymentData?.status ?? "").trim();
    const mappedStatus = getInternalPaymentStatusFromMercadoPago(paymentData) || "pending";
    const currentOrderStatus = String(order.status ?? "").trim();
    const canUpdateRefundMovement =
      ["approved", "partially_refunded", "refund_pending"].includes(currentOrderStatus) &&
      ["partially_refunded", "refund_pending", "refunded"].includes(mappedStatus);
    if (terminalStatuses.has(currentOrderStatus) && !canUpdateRefundMovement) {
      if (currentOrderStatus === "approved") {
        const dispatchesOk = await ensureApprovedOrderDispatches(supabaseAdmin, order.id);
        if (!dispatchesOk) {
          return jsonResponse({ error: "No se pudo inicializar la venta." }, 500);
        }
      }
      return jsonResponse({ ok: true, status: currentOrderStatus });
    }
    const paidAmount = Number(paymentData?.transaction_amount ?? 0);
    const expectedAmount = Number(order.total_amount ?? 0);
    const currencyId = String(paymentData?.currency_id ?? "").toUpperCase();
    const orderCurrency = String(order.currency ?? "").toUpperCase();
    const amountMatches = Number.isFinite(paidAmount) && Math.abs(paidAmount - expectedAmount) < 0.01;
    const currencyMatches = !orderCurrency || currencyId === orderCurrency;

    if (!amountMatches || !currencyMatches) {
      const reason = !amountMatches ? "amount_mismatch" : "currency_mismatch";
      const { error: rejectUpdateError } = await supabaseAdmin
        .from("orders")
        .update({
          status: "rejected",
          payment_status: paymentStatus,
          payment_id: resolvedPaymentId,
          payment_detail: reason,
        })
        .eq("id", order.id);
      if (rejectUpdateError) {
        return jsonResponse({ error: "No se pudo actualizar la orden." }, 500);
      }
      await recordOrderPaymentMovement(supabaseAdmin, {
        order,
        orderId: order.id,
        source: "mercadopago-payment-sync",
        nextStatus: "rejected",
        paymentStatus,
        paymentId: resolvedPaymentId,
        paymentDetail: reason,
        paymentData,
      });
      return jsonResponse({ ok: true, status: "rejected" });
    }

    if (mappedStatus === "approved") {
      const availability = await findApprovedProductConflicts(supabaseAdmin, order.id);
      if (!availability.ok) {
        return jsonResponse({ error: "No se pudo validar disponibilidad." }, 500);
      }
      if (availability.conflicts.length > 0) {
        const { error: conflictUpdateError } = await supabaseAdmin
          .from("orders")
          .update({
            status: "rejected",
            payment_status: paymentStatus,
            payment_id: resolvedPaymentId,
            payment_detail: "product_already_sold",
          })
          .eq("id", order.id);
        if (conflictUpdateError) {
          return jsonResponse({ error: "No se pudo actualizar la orden." }, 500);
        }
        await recordOrderPaymentMovement(supabaseAdmin, {
          order,
          orderId: order.id,
          source: "mercadopago-payment-sync",
          nextStatus: "rejected",
          paymentStatus,
          paymentId: resolvedPaymentId,
          paymentDetail: "product_already_sold",
          paymentData,
        });
        return jsonResponse({ ok: true, status: "rejected" });
      }
    }

    const paymentDetail = mergeMercadoPagoPaymentDetail(order.payment_detail, paymentData?.status_detail);
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: mappedStatus,
        payment_status: paymentStatus,
        payment_id: resolvedPaymentId,
        payment_detail: paymentDetail,
      })
      .eq("id", order.id);

    if (updateError) {
      return jsonResponse({ error: "No se pudo actualizar la orden." }, 500);
    }

    await recordOrderPaymentMovement(supabaseAdmin, {
      order,
      orderId: order.id,
      source: "mercadopago-payment-sync",
      nextStatus: mappedStatus,
      paymentStatus,
      paymentId: resolvedPaymentId,
      paymentDetail,
      paymentData,
    });

    if (mappedStatus === "approved") {
      const dispatchesOk = await ensureApprovedOrderDispatches(supabaseAdmin, order.id);
      if (!dispatchesOk) {
        return jsonResponse({ error: "No se pudo inicializar la venta." }, 500);
      }
    }

    return jsonResponse({ ok: true, status: mappedStatus });
  } catch (error) {
    console.error("[mp-payment-sync] Unhandled error", error);
    return jsonResponse({ error: "No se pudo sincronizar el pago." }, 500);
  }
};
