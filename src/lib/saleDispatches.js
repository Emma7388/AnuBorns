const INITIAL_FULFILLMENT_BY_DELIVERY = {
  shipping: "requested",
  pickup: "pickup_pending",
};

const uniqueStrings = (values = []) => [
  ...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  ),
];

const normalizeProviderName = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getShippingProviderNames = (shippingAddress) =>
  String(shippingAddress ?? "")
    .split("|")
    .map((part) => part.split(":")[0])
    .map(normalizeProviderName)
    .filter(Boolean);

export const createInitialSaleDispatches = async (
  supabaseAdmin,
  { orderId, shippingRequested = null, shippingProductIds = [] } = {},
) => {
  const safeOrderId = String(orderId ?? "").trim();
  if (!supabaseAdmin || !safeOrderId) {
    return { ok: false, error: "Faltan datos de orden." };
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, shipping_requested, shipping_address")
    .eq("id", safeOrderId)
    .maybeSingle();

  if (orderError) {
    return { ok: false, error: "No se pudo validar la orden." };
  }
  if (!order?.id) {
    return { ok: false, error: "Orden inexistente." };
  }

  const { data: orderItems, error: orderItemsError } = await supabaseAdmin
    .from("order_items")
    .select("product_id, provider")
    .eq("order_id", safeOrderId);

  if (orderItemsError) {
    return { ok: false, error: "No se pudieron validar los productos de la orden." };
  }

  const productIds = uniqueStrings((orderItems ?? []).map((item) => item?.product_id));
  if (productIds.length === 0) {
    return { ok: true, createdCount: 0 };
  }

  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, user_id, seller_name")
    .in("id", productIds);

  if (productsError) {
    return { ok: false, error: "No se pudieron validar los vendedores." };
  }

  const productsById = new Map(
    (products ?? [])
      .map((product) => [String(product?.id ?? "").trim(), product])
      .filter(([productId]) => productId),
  );
  const providerByProduct = new Map(
    (orderItems ?? [])
      .map((item) => [String(item?.product_id ?? "").trim(), String(item?.provider ?? "").trim()])
      .filter(([productId]) => productId),
  );

  const hasShipping = typeof shippingRequested === "boolean"
    ? shippingRequested
    : Boolean(order.shipping_requested);
  const explicitShippingProductIds = new Set(uniqueStrings(shippingProductIds));
  const requestedProviderNames = getShippingProviderNames(order.shipping_address);

  const getProductFulfillmentStatus = (productId) => {
    if (!hasShipping) return INITIAL_FULFILLMENT_BY_DELIVERY.pickup;
    if (explicitShippingProductIds.size > 0) {
      return explicitShippingProductIds.has(productId)
        ? INITIAL_FULFILLMENT_BY_DELIVERY.shipping
        : INITIAL_FULFILLMENT_BY_DELIVERY.pickup;
    }
    if (requestedProviderNames.length > 0) {
      const product = productsById.get(productId);
      const providerName = providerByProduct.get(productId) || String(product?.seller_name ?? "");
      return requestedProviderNames.includes(normalizeProviderName(providerName))
        ? INITIAL_FULFILLMENT_BY_DELIVERY.shipping
        : INITIAL_FULFILLMENT_BY_DELIVERY.pickup;
    }
    return INITIAL_FULFILLMENT_BY_DELIVERY.shipping;
  };

  const rows = productIds
    .map((productId) => ({
      seller_id: String(productsById.get(productId)?.user_id ?? "").trim(),
      order_id: safeOrderId,
      product_id: productId,
      fulfillment_status: getProductFulfillmentStatus(productId),
    }))
    .filter((row) => row.seller_id);

  if (rows.length !== productIds.length) {
    return { ok: false, error: "Hay productos sin vendedor asignado." };
  }

  const { error: upsertError } = await supabaseAdmin
    .from("sale_dispatches")
    .upsert(rows, {
      onConflict: "seller_id,order_id,product_id",
      ignoreDuplicates: true,
    });

  if (upsertError) {
    return { ok: false, error: "No se pudo inicializar la venta para el vendedor." };
  }

  return { ok: true, createdCount: rows.length };
};
