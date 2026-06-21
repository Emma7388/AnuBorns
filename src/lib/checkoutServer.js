/* Validaciones compartidas por checkout manual y Mercado Pago. */
export const SHIPPING_FEE = 5000;
const SOLD_ORDER_STATUSES = ["approved"];

/* El carrito puede mandar datos legacy, pero cantidad siempre queda fija en 1. */
export const sanitizeCheckoutItems = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      product_id: String(item?.product_id ?? item?.id ?? "").trim(),
      qty: 1,
    }))
    .filter((item) => item.product_id);

/* Nota del comprador acotada para guardarla segura en payment_detail. */
export const sanitizeBuyerNote = (value) => {
  const note = String(value ?? "").trim();
  if (!note) return "";
  return note.slice(0, 500);
};

/* Normaliza métodos de entrega provenientes de Supabase o payloads antiguos. */
export const normalizeDeliveryMethods = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return String(value ?? "")
    .split(/[,+]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

/* Lee grupos de envío por proveedor desde el payload validado por frontend. */
const parseRequestedShippingGroups = (shipping = {}) =>
  (Array.isArray(shipping?.groups) ? shipping.groups : [])
    .map((group) => ({
      providerKey: String(group?.provider_key ?? "").trim(),
      provider: String(group?.provider ?? "").trim(),
      address: String(group?.address ?? "").trim(),
      city: String(group?.city ?? "").trim(),
    }))
    .filter((group) => group.providerKey);

/* Encuentra productos de un proveedor por user_id o por nombre legacy. */
const getProviderGroupItems = (serverItems, providerKey) => {
  const providerUserId = providerKey.startsWith("id:") ? providerKey.slice(3) : "";
  return serverItems.filter((item) =>
    providerUserId
      ? item.provider_user_id === providerUserId
      : `name:${String(item.provider ?? "").trim().toLowerCase() || "n/a"}` === providerKey,
  );
};

/* Construye el contexto confiable del checkout desde datos del servidor. */
export const buildCheckoutContext = async (
  supabaseAdmin,
  { rawItems = [], shipping = {}, buyerId = "", requirePositivePrice = true } = {},
) => {
  if (!supabaseAdmin) {
    return { ok: false, status: 503, error: "Servicio no disponible." };
  }

  const items = sanitizeCheckoutItems(rawItems);
  if (items.length === 0) {
    return { ok: false, status: 400, error: "El carrito esta vacio." };
  }
  const requestedShippingGroups = parseRequestedShippingGroups(shipping);
  const shippingRequested = requestedShippingGroups.length > 0 || Boolean(shipping?.requested);
  const productIds = [...new Set(items.map((item) => item.product_id))];

  /* Producto único: una orden approved bloquea nuevas compras del mismo producto. */
  const { data: soldRows, error: soldError } = await supabaseAdmin
    .from("order_items")
    .select("product_id, orders!inner(status)")
    .in("product_id", productIds)
    .in("orders.status", SOLD_ORDER_STATUSES);

  if (soldError) {
    return { ok: false, status: 500, error: "No se pudo validar la disponibilidad de los productos." };
  }
  const soldProductIds = new Set(
    (soldRows ?? []).map((row) => String(row?.product_id ?? "").trim()).filter(Boolean),
  );
  if (productIds.some((productId) => soldProductIds.has(productId))) {
    return {
      ok: false,
      status: 409,
      error: "Uno o mas productos ya fueron vendidos.",
      soldProductIds: productIds.filter((productId) => soldProductIds.has(productId)),
    };
  }

  /* Se vuelven a leer productos para ignorar precios/nombres enviados por el cliente. */
  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, title, description, price, currency, seller_name, contact, user_id, image_url, delivery_methods")
    .in("id", productIds);

  if (productsError) {
    return { ok: false, status: 500, error: "No se pudieron validar los productos." };
  }

  const productsMap = new Map((products ?? []).map((product) => [String(product.id), product]));
  if (productsMap.size !== productIds.length) {
    return { ok: false, status: 400, error: "Hay productos invalidos o no disponibles." };
  }

  /* Snapshot de items que se guardará en order_items y se enviará a MercadoPago. */
  const serverItems = items.map((item) => {
    const product = productsMap.get(item.product_id);
    const unitPrice = Number(product?.price ?? 0);
    const safePrice = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0;
    return {
      product_id: item.product_id,
      name: String(product?.title ?? "Producto"),
      description: String(product?.description ?? "").trim(),
      qty: item.qty,
      unit_price: safePrice,
      provider: String(product?.seller_name ?? "").trim(),
      provider_whatsapp: String(product?.contact ?? "").trim(),
      provider_user_id: String(product?.user_id ?? "").trim(),
      currency: String(product?.currency ?? "ARS").toUpperCase(),
      image: String(product?.image_url ?? "").trim(),
      delivery_methods: normalizeDeliveryMethods(product?.delivery_methods),
    };
  });

  /* Reglas de integridad antes de crear orden/preferencia. */
  if (requirePositivePrice && serverItems.some((item) => item.unit_price <= 0)) {
    return { ok: false, status: 400, error: "Hay productos sin precio valido." };
  }

  const hasMixedCurrency = new Set(serverItems.map((item) => item.currency)).size > 1;
  if (hasMixedCurrency) {
    return { ok: false, status: 400, error: "No se puede comprar productos con distintas monedas." };
  }

  const hasOwnProducts = serverItems.some((item) => item.provider_user_id && item.provider_user_id === buyerId);
  if (hasOwnProducts) {
    return { ok: false, status: 400, error: "No podes comprar tus propios productos." };
  }

  if (shippingRequested) {
    /* Compatibilidad con checkout viejo: envío único sin grupos por proveedor. */
    if (requestedShippingGroups.length === 0) {
      const allItemsSupportShipping = serverItems.every((item) => item.delivery_methods.includes("envio"));
      if (!allItemsSupportShipping) {
        return { ok: false, status: 400, error: "Hay productos que no aceptan envio." };
      }
      if (!String(shipping?.address ?? "").trim() || !String(shipping?.city ?? "").trim()) {
        return { ok: false, status: 400, error: "Faltan direccion y ciudad para el envio." };
      }
    }

    /* Validación por proveedor para compras multiproveedor. */
    for (const group of requestedShippingGroups) {
      if (!group.address || !group.city) {
        return { ok: false, status: 400, error: "Faltan direccion y ciudad para un proveedor." };
      }
      const providerItems = getProviderGroupItems(serverItems, group.providerKey);
      if (providerItems.length === 0 || providerItems.some((item) => !item.delivery_methods.includes("envio"))) {
        return { ok: false, status: 400, error: "Hay productos que no aceptan envio." };
      }
    }
  }

  /* Totales finales derivados del servidor. */
  const orderCurrency = serverItems[0]?.currency || "ARS";
  const shippingCost = requestedShippingGroups.length
    ? requestedShippingGroups.length * SHIPPING_FEE
    : shippingRequested
      ? SHIPPING_FEE
      : 0;
  const shippingProductIds = shippingRequested
    ? requestedShippingGroups.length > 0
      ? serverItems
          .filter((item) => requestedShippingGroups.some((group) => getProviderGroupItems([item], group.providerKey).length > 0))
          .map((item) => item.product_id)
      : serverItems.map((item) => item.product_id)
    : [];
  const totalAmount = serverItems.reduce((sum, item) => sum + item.unit_price * item.qty, 0) + shippingCost;

  return {
    ok: true,
    items,
    serverItems,
    requestedShippingGroups,
    shippingRequested,
    shippingCost,
    shippingProductIds,
    totalAmount,
    orderCurrency,
  };
};

/* Convierte el contexto validado en filas para order_items. */
export const buildOrderItems = (orderId, serverItems = []) =>
  serverItems.map((item) => ({
    order_id: orderId,
    product_id: item.product_id,
    name: item.name,
    qty: item.qty,
    unit_price: item.unit_price,
    provider: item.provider || null,
    unit: null,
    image: item.image || null,
  }));
