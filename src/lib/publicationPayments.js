export const MONTHLY_PUBLICATION_PRICE = 2000;
export const MONTHLY_PUBLICATION_DAYS = 30;
export const PUBLICATION_REFERENCE_PREFIX = "publication:";

export const getPublicationPaymentIdFromReference = (value) => {
  const reference = String(value ?? "").trim();
  return reference.startsWith(PUBLICATION_REFERENCE_PREFIX)
    ? reference.slice(PUBLICATION_REFERENCE_PREFIX.length).trim()
    : "";
};

const getPublicationPeriod = (value = new Date()) => {
  const startedAt = value instanceof Date ? value : new Date(value);
  const safeStartedAt = Number.isFinite(startedAt.getTime()) ? startedAt : new Date();
  return {
    startedAt: safeStartedAt.toISOString(),
    expiresAt: new Date(safeStartedAt.getTime() + MONTHLY_PUBLICATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
};

const activatePaidPublication = async (supabaseAdmin, record, approvedAt) => {
  const period = getPublicationPeriod(approvedAt);
  const { data: product, error } = await supabaseAdmin
    .from("products")
    .update({
      publication_status: "active",
      publication_started_at: period.startedAt,
      publication_expires_at: period.expiresAt,
    })
    .eq("id", record.product_id)
    .eq("user_id", record.user_id)
    .eq("publication_type", "monthly")
    .select("id")
    .maybeSingle();
  return error || !product?.id
    ? { ok: false, error: "El pago se aprobó, pero no se pudo activar la publicación." }
    : { ok: true, ...period };
};

const cancelRefundedPublication = async (supabaseAdmin, record, now = new Date()) => {
  if (!record.product_id) return { ok: true, publicationStatus: "deleted" };
  const { data: product, error: readError } = await supabaseAdmin.from("products")
    .select("id,publication_started_at").eq("id", record.product_id).maybeSingle();
  if (readError) return { ok: false, error: "No se pudo comprobar la publicación reembolsada." };
  const isCurrentPeriod = record.approved_at
    && product?.publication_started_at
    && Math.abs(Date.parse(record.approved_at) - Date.parse(product.publication_started_at)) < 1000;
  if (!isCurrentPeriod) return { ok: true, publicationStatus: "active" };
  const { error: updateError } = await supabaseAdmin.from("products").update({
    publication_status: "cancelled",
    publication_expires_at: now.toISOString(),
  }).eq("id", record.product_id).eq("user_id", record.user_id);
  return updateError
    ? { ok: false, error: "No se pudo cancelar la publicación reembolsada." }
    : { ok: true, publicationStatus: "cancelled" };
};

export const applyPublicationPayment = async (supabaseAdmin, paymentData) => {
  const paymentRecordId = getPublicationPaymentIdFromReference(paymentData?.external_reference);
  if (!paymentRecordId) return { handled: false };
  const { data: record, error } = await supabaseAdmin
    .from("product_publication_payments")
    .select("id,product_id,user_id,amount,currency,status,payment_id,approved_at")
    .eq("id", paymentRecordId)
    .maybeSingle();
  if (error || !record) return { handled: true, ok: false, status: 404, error: "Pago de publicación no encontrado." };

  const amount = Number(paymentData?.transaction_amount ?? 0);
  const currency = String(paymentData?.currency_id ?? "").toUpperCase();
  const mpStatus = String(paymentData?.status ?? "").toLowerCase();
  const amountMatches = Math.abs(amount - Number(record.amount)) < 0.01;
  const currencyMatches = currency === String(record.currency).toUpperCase();
  const approved = mpStatus === "approved" && amountMatches && currencyMatches;
  const paymentId = String(paymentData?.id ?? "").trim();
  if (record.status === "refunded") {
    const cancellation = await cancelRefundedPublication(supabaseAdmin, record);
    return cancellation.ok
      ? { handled: true, ok: true, status: 200, publicationStatus: cancellation.publicationStatus, paymentStatus: "refunded" }
      : { handled: true, ok: false, status: 500, error: cancellation.error };
  }
  if (approved && record.status === "approved" && String(record.payment_id ?? "") === paymentId) {
    if (!record.product_id) {
      return { handled: true, ok: true, status: 200, publicationStatus: "deleted", paymentStatus: "approved" };
    }
    const activation = await activatePaidPublication(supabaseAdmin, record, record.approved_at);
    if (!activation.ok) return { handled: true, ok: false, status: 500, error: activation.error };
    return { handled: true, ok: true, status: 200, publicationStatus: "active", expiresAt: activation.expiresAt };
  }
  const nextStatus = approved
    ? "approved"
    : ["rejected", "cancelled", "refunded"].includes(mpStatus)
      ? mpStatus
      : "pending";
  if (record.status === "approved" && nextStatus !== "refunded") {
    if (!record.product_id) {
      return { handled: true, ok: true, status: 200, publicationStatus: "deleted", paymentStatus: "approved" };
    }
    const activation = await activatePaidPublication(supabaseAdmin, record, record.approved_at);
    if (!activation.ok) return { handled: true, ok: false, status: 500, error: activation.error };
    return { handled: true, ok: true, status: 200, publicationStatus: "active", expiresAt: activation.expiresAt, paymentStatus: "approved" };
  }
  const statusDetail = String(paymentData?.status_detail ?? "").trim();
  const now = new Date();
  const approvalPeriod = getPublicationPeriod(record.approved_at ?? now);

  const { error: paymentError } = await supabaseAdmin
    .from("product_publication_payments")
    .update({
      status: nextStatus,
      payment_id: paymentId || null,
      payment_status: mpStatus || null,
      payment_detail: !amountMatches ? "amount_mismatch" : !currencyMatches ? "currency_mismatch" : statusDetail || null,
      approved_at: approved ? approvalPeriod.startedAt : record.approved_at ?? null,
      updated_at: now.toISOString(),
    })
    .eq("id", record.id);
  if (paymentError) return { handled: true, ok: false, status: 500, error: "No se pudo guardar el pago." };

  if (approved) {
    const activation = await activatePaidPublication(supabaseAdmin, record, approvalPeriod.startedAt);
    if (!activation.ok) return { handled: true, ok: false, status: 500, error: activation.error };
    return { handled: true, ok: true, status: 200, publicationStatus: "active", expiresAt: activation.expiresAt };
  }
  if (nextStatus === "refunded") {
    const cancellation = await cancelRefundedPublication(supabaseAdmin, { ...record, approved_at: record.approved_at }, now);
    return cancellation.ok
      ? { handled: true, ok: true, status: 200, publicationStatus: cancellation.publicationStatus, paymentStatus: nextStatus }
      : { handled: true, ok: false, status: 500, error: cancellation.error };
  }
  return { handled: true, ok: true, status: 200, publicationStatus: "pending_payment", paymentStatus: nextStatus };
};
