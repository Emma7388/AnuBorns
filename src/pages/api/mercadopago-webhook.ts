import type { APIRoute } from "astro";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../../lib/supabaseServer";

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

if (!accessToken) {
  throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN.");
}

if (!webhookSecret) {
  throw new Error("Missing MERCADOPAGO_WEBHOOK_SECRET.");
}

const statusMap: Record<string, string> = {
  approved: "approved",
  pending: "pending",
  in_process: "pending",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
};

const terminalStatuses = new Set(["approved", "rejected", "cancelled", "refunded"]);

const parseSignatureHeader = (header: string | null) => {
  if (!header) return null;
  const parts = header.split(",").map((value) => value.trim());
  const data: Record<string, string> = {};
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) data[key.trim()] = value.trim();
  }
  if (!data.ts || !data.v1) return null;
  return { ts: data.ts, v1: data.v1 };
};

const normalizeId = (value: string | null) => (value ?? "").toString().toLowerCase();

const toTimestampMs = (ts: string) => {
  const numeric = Number(ts);
  if (!Number.isFinite(numeric)) return null;
  return ts.length <= 10 ? numeric * 1000 : numeric;
};

const verifySignature = (signatureHeader: string | null, requestId: string | null, dataId: string | null) => {
  const signature = parseSignatureHeader(signatureHeader);
  if (!signature || !requestId || !dataId) return false;

  const tsMs = toTimestampMs(signature.ts);
  if (!tsMs) return false;

  const now = Date.now();
  const maxSkewMs = 5 * 60 * 1000;
  if (Math.abs(now - tsMs) > maxSkewMs) return false;

  const manifest = `id:${normalizeId(dataId)};request-id:${requestId};ts:${signature.ts};`;
  const expected = createHmac("sha256", webhookSecret).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature.v1));
  } catch {
    return false;
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const queryTopic = url.searchParams.get("topic") || url.searchParams.get("type");
    const queryId = url.searchParams.get("id");
    const queryDataId = url.searchParams.get("data.id") || url.searchParams.get("data_id");

    let payload: any = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const bodyType = payload?.type || payload?.topic;
    const bodyId = payload?.data?.id || payload?.id;

    const topic = (queryTopic || bodyType || "payment").toString();
    const paymentId = (queryId || bodyId || queryDataId || "").toString();

    const signatureHeader = request.headers.get("x-signature");
    const requestId = request.headers.get("x-request-id");
    const dataIdForSignature = queryDataId || bodyId || paymentId;

    if (!verifySignature(signatureHeader, requestId, dataIdForSignature)) {
      console.warn("[mp-webhook] Invalid signature", {
        topic,
        paymentId: paymentId ? paymentId.slice(0, 8) : "missing",
      });
      return new Response("Invalid signature", { status: 401 });
    }

    if (!paymentId) {
      console.warn("[mp-webhook] Missing payment id");
      return new Response("Missing payment id", { status: 400 });
    }

    if (topic !== "payment") {
      return new Response("Ignored", { status: 200 });
    }

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!paymentResponse.ok) {
      console.error("[mp-webhook] Payment fetch error", await paymentResponse.text());
      return new Response("Payment fetch error", { status: 502 });
    }

    const paymentData = await paymentResponse.json();
    const externalReference = paymentData?.external_reference;
    const paymentStatus = paymentData?.status;
    const paidAmount = Number(paymentData?.transaction_amount ?? 0);
    const currencyId = String(paymentData?.currency_id ?? "").toUpperCase();

    if (!externalReference) {
      console.error("[mp-webhook] Missing external_reference");
      return new Response("Missing external_reference", { status: 400 });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, status, total_amount, currency, payment_id")
      .eq("id", externalReference)
      .maybeSingle();

    if (orderError || !order) {
      console.error("[mp-webhook] Order not found", { orderId: externalReference });
      return new Response("Order not found", { status: 404 });
    }

    const expectedAmount = Number(order.total_amount ?? 0);
    const amountMatches = Number.isFinite(paidAmount) && Math.abs(paidAmount - expectedAmount) < 0.01;
    const currencyMatches = !order.currency || currencyId === String(order.currency).toUpperCase();

    if (!amountMatches || !currencyMatches) {
      const reason = !amountMatches ? "amount_mismatch" : "currency_mismatch";
      await supabaseAdmin
        .from("orders")
        .update({
          status: "rejected",
          payment_status: paymentStatus,
          payment_id: paymentId,
          payment_detail: reason,
        })
        .eq("id", order.id);

      console.warn("[mp-webhook] Payment mismatch", {
        orderId: order.id,
        expectedAmount,
        paidAmount,
        orderCurrency: order.currency,
        currencyId,
      });

      return new Response("Payment mismatch", { status: 200 });
    }

    const mappedStatus = statusMap[paymentStatus] ?? "pending";

    if (terminalStatuses.has(order.status)) {
      if (order.status === "approved" && mappedStatus === "refunded") {
        // Allow chargeback/refund updates.
      } else {
        return new Response("Already processed", { status: 200 });
      }
    }

    if (order.payment_id && order.payment_id === paymentId && order.status === mappedStatus) {
      return new Response("Idempotent", { status: 200 });
    }

    await supabaseAdmin
      .from("orders")
      .update({
        status: mappedStatus,
        payment_status: paymentStatus,
        payment_id: paymentId,
        payment_detail: paymentData?.status_detail ?? null,
      })
      .eq("id", order.id);

    console.info("[mp-webhook] Order updated", {
      orderId: order.id,
      status: mappedStatus,
      paymentId: paymentId ? paymentId.slice(0, 8) : "unknown",
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[mp-webhook] Unhandled error", error);
    return new Response("Webhook error", { status: 500 });
  }
};

export const GET: APIRoute = POST;
