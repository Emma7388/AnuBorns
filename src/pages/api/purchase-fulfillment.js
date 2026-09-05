/* API comprador: lee estados por producto y marca notificaciones como vistas. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getUniqueStringIds } from "../../lib/orderInput.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

/* Parsea listas de ids desde query params. */
const parseCsv = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/* Estados que pueden almacenarse como leídos por el comprador. */
const VALID_FULFILLMENT_STATUSES = new Set([
  "pending",
  "requested",
  "preparing",
  "shipped",
  "delivered",
  "pickup_pending",
  "ready_for_pickup",
  "picked_up",
  "completed",
]);

const DEFAULT_STATUS_UPDATED_AT = "1970-01-01T00:00:00.000Z";

/* Normaliza fechas para que las claves de lectura sean comparables. */
const normalizeStatusUpdatedAt = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return DEFAULT_STATUS_UPDATED_AT;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return DEFAULT_STATUS_UPDATED_AT;
  return date.toISOString();
};

/** @type {import("astro").APIRoute} */
export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "purchase-fulfillment",
      windowMs: 60_000,
      max: 80,
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
    const user = auth.user;

    const url = new URL(request.url);
    const orderIds = [...new Set(parseCsv(url.searchParams.get("orderIds")))];
    if (orderIds.length === 0) {
      return jsonResponse({ items: [] });
    }

    const buyerId = user.id;
    /* Solo se devuelven estados de órdenes propias. */
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, shipping_status, shipping_requested")
      .eq("user_id", buyerId)
      .in("id", orderIds);

    if (ordersError) {
      return jsonResponse({ error: "No se pudieron validar las compras." }, 500);
    }

    const ownedOrderIds = [...new Set((orders ?? []).map((order) => String(order?.id ?? "").trim()).filter(Boolean))];
    if (ownedOrderIds.length === 0) {
      return jsonResponse({ items: [] });
    }

    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
      .from("order_items")
      .select("order_id, product_id")
      .in("order_id", ownedOrderIds);

    if (orderItemsError) {
      return jsonResponse({ error: "No se pudieron validar los productos." }, 500);
    }

    const productIds = [...new Set((orderItems ?? []).map((item) => String(item?.product_id ?? "").trim()).filter(Boolean))];
    if (productIds.length === 0) {
      return jsonResponse({ items: [] });
    }

    /* sale_dispatches tiene el estado real por producto. */
    const { data: dispatchRows, error: dispatchError } = await supabaseAdmin
      .from("sale_dispatches")
      .select("order_id, product_id, fulfillment_status, status_updated_at")
      .in("order_id", ownedOrderIds)
      .in("product_id", productIds);

    if (dispatchError) {
      return jsonResponse({ error: "No se pudieron cargar los estados de retiro." }, 500);
    }

    const dispatchMap = new Map(
      (dispatchRows ?? []).map((row) => [
        `${String(row?.order_id ?? "").trim()}::${String(row?.product_id ?? "").trim()}`,
        row,
      ]),
    );
    /* Fallback para órdenes antiguas sin fila por producto. */
    const orderFallbackStatus = new Map(
      (orders ?? []).map((order) => {
        const status = String(order?.shipping_status ?? "").trim();
        const fallback = status || (order?.shipping_requested ? "requested" : "pickup_pending");
        return [String(order?.id ?? "").trim(), fallback];
      }),
    );

    /* Lecturas previas evitan repetir toasts ya vistos. */
    const { data: readRows, error: readError } = await supabaseAdmin
      .from("purchase_status_reads")
      .select("order_id, product_id, fulfillment_status, status_updated_at")
      .eq("user_id", buyerId)
      .in("order_id", ownedOrderIds);

    if (readError) {
      return jsonResponse({ error: "No se pudieron cargar estados leídos." }, 500);
    }

    const readSet = new Set(
      (readRows ?? []).map((row) =>
        [
          String(row?.order_id ?? "").trim(),
          String(row?.product_id ?? "").trim(),
          String(row?.fulfillment_status ?? "").trim(),
          normalizeStatusUpdatedAt(row?.status_updated_at),
        ].join("::")
      ),
    );

    const items = (orderItems ?? []).map((item) => {
      const orderId = String(item?.order_id ?? "").trim();
      const productId = String(item?.product_id ?? "").trim();
      const dispatch = dispatchMap.get(`${orderId}::${productId}`);
      const fulfillmentStatus =
        String(dispatch?.fulfillment_status ?? orderFallbackStatus.get(orderId) ?? "pickup_pending").trim() ||
        "pickup_pending";
      const statusUpdatedAt = normalizeStatusUpdatedAt(dispatch?.status_updated_at);
      return {
        orderId,
        productId,
        fulfillmentStatus,
        statusUpdatedAt,
        statusRead: readSet.has(`${orderId}::${productId}::${fulfillmentStatus}::${statusUpdatedAt}`),
      };
    });

    return jsonResponse({ items, hasAnyRead: readSet.size > 0 });
  } catch (error) {
    console.error("[purchase-fulfillment] Unhandled error", error);
    return jsonResponse({ error: "No se pudieron cargar los estados de retiro." }, 500);
  }
};

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "purchase-fulfillment-read",
      windowMs: 60_000,
      max: 120,
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
    const user = auth.user;

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "El detalle de lecturas no es válido." }, 400);
    }
    /* Solo se aceptan marcas de lectura completas y con estado válido. */
    const reads = (Array.isArray(payload?.items) ? payload.items : [])
      .map((item) => ({
        orderId: String(item?.orderId ?? "").trim(),
        productId: String(item?.productId ?? "").trim(),
        fulfillmentStatus: String(item?.fulfillmentStatus ?? "").trim(),
        statusUpdatedAt: normalizeStatusUpdatedAt(item?.statusUpdatedAt),
      }))
      .filter((item) =>
        item.orderId &&
        item.productId &&
        VALID_FULFILLMENT_STATUSES.has(item.fulfillmentStatus)
      );

    if (reads.length === 0) {
      return jsonResponse({ ok: true, inserted: 0 });
    }

    const orderIds = [...new Set(reads.map((item) => item.orderId))];
    const productIds = getUniqueStringIds(reads.map((item) => item.productId));
    const buyerId = user.id;

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, shipping_status, shipping_requested")
      .eq("user_id", buyerId)
      .in("id", orderIds);

    if (ordersError) {
      return jsonResponse({ error: "No se pudieron validar las compras." }, 500);
    }

    const ownedOrderIds = new Set((orders ?? []).map((order) => String(order?.id ?? "").trim()).filter(Boolean));
    if (ownedOrderIds.size === 0) {
      return jsonResponse({ error: "No autorizado para marcar estos estados." }, 403);
    }

    /* Valida pares orden-producto para impedir marcar estados ajenos. */
    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
      .from("order_items")
      .select("order_id, product_id")
      .in("order_id", [...ownedOrderIds])
      .in("product_id", productIds);

    if (orderItemsError) {
      return jsonResponse({ error: "No se pudieron validar los productos." }, 500);
    }

    const validPairs = new Set(
      (orderItems ?? []).map((item) =>
        `${String(item?.order_id ?? "").trim()}::${String(item?.product_id ?? "").trim()}`
      ),
    );

    const { data: dispatchRows, error: dispatchError } = await supabaseAdmin
      .from("sale_dispatches")
      .select("order_id, product_id, fulfillment_status, status_updated_at")
      .in("order_id", [...ownedOrderIds])
      .in("product_id", productIds);

    if (dispatchError) {
      return jsonResponse({ error: "No se pudieron validar los estados actuales." }, 500);
    }

    const orderFallbackStatus = new Map(
      (orders ?? []).map((order) => {
        const status = String(order?.shipping_status ?? "").trim();
        const fallback = status || (order?.shipping_requested ? "requested" : "pickup_pending");
        return [String(order?.id ?? "").trim(), fallback];
      }),
    );
    /* Estado actual autorizado: fallback de orden y luego valor real de dispatch. */
    const currentStateByPair = new Map(
      (orderItems ?? []).map((item) => {
        const orderId = String(item?.order_id ?? "").trim();
        const productId = String(item?.product_id ?? "").trim();
        return [
          `${orderId}::${productId}`,
          {
            fulfillmentStatus: orderFallbackStatus.get(orderId) || "pickup_pending",
            statusUpdatedAt: DEFAULT_STATUS_UPDATED_AT,
          },
        ];
      }),
    );
    (dispatchRows ?? []).forEach((row) => {
      const orderId = String(row?.order_id ?? "").trim();
      const productId = String(row?.product_id ?? "").trim();
      const status = String(row?.fulfillment_status ?? "").trim();
      if (orderId && productId && status) {
        currentStateByPair.set(`${orderId}::${productId}`, {
          fulfillmentStatus: status,
          statusUpdatedAt: normalizeStatusUpdatedAt(row?.status_updated_at),
        });
      }
    });

    /* Solo se insertan lecturas que coinciden con el estado actual exacto. */
    const rows = reads
      .filter((item) => ownedOrderIds.has(item.orderId))
      .filter((item) => {
        const pairKey = `${item.orderId}::${item.productId}`;
        const currentState = currentStateByPair.get(pairKey);
        return (
          validPairs.has(pairKey) &&
          currentState?.fulfillmentStatus === item.fulfillmentStatus &&
          currentState?.statusUpdatedAt === item.statusUpdatedAt
        );
      })
      .map((item) => ({
        user_id: buyerId,
        order_id: item.orderId,
        product_id: item.productId,
        fulfillment_status: item.fulfillmentStatus,
        status_updated_at: item.statusUpdatedAt,
      }));

    if (rows.length === 0) {
      return jsonResponse({ error: "No autorizado para marcar estos productos." }, 403);
    }

    const { error: upsertError } = await supabaseAdmin
      .from("purchase_status_reads")
      .upsert(rows, { onConflict: "user_id,order_id,product_id,fulfillment_status,status_updated_at", ignoreDuplicates: true });

    if (upsertError) {
      return jsonResponse({ error: "No se pudieron marcar los estados como leídos." }, 500);
    }

    return jsonResponse({ ok: true, inserted: rows.length });
  } catch (error) {
    console.error("[purchase-fulfillment-read] Unhandled error", error);
    return jsonResponse({ error: "No se pudieron marcar los estados como leídos." }, 500);
  }
};
