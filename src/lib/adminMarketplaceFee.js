const FEE_TRACE_PREFIX = "mp_preference|";

const parsePositiveNumber = (value) => {
  const number = Number(String(value ?? "").trim());
  return Number.isFinite(number) && number > 0 ? number : 0;
};

export const parseMarketplaceFeeTrace = (paymentDetail) => {
  const detail = String(paymentDetail ?? "").trim();
  if (!detail || !detail.includes(FEE_TRACE_PREFIX)) {
    return {
      hasTrace: false,
      marketplaceFee: 0,
      marketplace: "",
      oauthSeller: "",
      mpStatusDetail: "",
    };
  }

  const trace = detail.split("|").reduce((data, part) => {
    const [key, ...rest] = String(part ?? "").split(":");
    if (!key || rest.length === 0) return data;
    return { ...data, [key]: rest.join(":").trim() };
  }, {});

  return {
    hasTrace: true,
    marketplaceFee: parsePositiveNumber(trace.marketplace_fee),
    marketplace: String(trace.marketplace ?? ""),
    oauthSeller: String(trace.oauth_seller ?? ""),
    mpStatusDetail: String(trace.mp_status_detail ?? ""),
  };
};

export const getAdminOrderPaymentState = (order = {}) => {
  const status = String(order?.status ?? "").trim().toLowerCase();
  const paymentStatus = String(order?.payment_status ?? "").trim().toLowerCase();
  return paymentStatus || status || "unknown";
};

export const isApprovedFeeOrder = (order = {}) => {
  const status = String(order?.status ?? "").trim().toLowerCase();
  const paymentStatus = String(order?.payment_status ?? "").trim().toLowerCase();
  return status === "approved" || paymentStatus === "approved";
};

const hasMercadoPagoTrace = (order = {}) => {
  const paymentId = String(order?.payment_id ?? "").trim();
  const preferenceId = String(order?.preference_id ?? "").trim();
  const detail = String(order?.payment_detail ?? "").trim();
  return Boolean(paymentId || preferenceId || detail.startsWith(FEE_TRACE_PREFIX));
};

export const summarizeMarketplaceFeeOrders = (orders = []) => {
  const parsedOrders = (Array.isArray(orders) ? orders : []).map((order) => {
    const trace = parseMarketplaceFeeTrace(order?.payment_detail);
    const paymentState = getAdminOrderPaymentState(order);
    const hasMpTrace = hasMercadoPagoTrace(order);
    const isApproved = isApprovedFeeOrder(order);
    return {
      ...order,
      payment_state: paymentState,
      marketplace_fee: trace.marketplaceFee,
      marketplace: trace.marketplace,
      oauth_seller: trace.oauthSeller,
      mp_status_detail: trace.mpStatusDetail,
      has_fee_trace: trace.hasTrace,
      has_mp_trace: hasMpTrace,
      fee_approved: trace.marketplaceFee > 0 && isApproved,
      mp_approved: hasMpTrace && isApproved,
      mp_without_fee_trace: hasMpTrace && isApproved && trace.marketplaceFee <= 0,
    };
  });

  const withFee = parsedOrders.filter((order) => order.marketplace_fee > 0);
  const approved = withFee.filter((order) => order.fee_approved);
  const pending = withFee.filter((order) => order.payment_state === "pending");
  const mpOrders = parsedOrders.filter((order) => order.has_mp_trace);
  const mpApproved = mpOrders.filter((order) => order.mp_approved);
  const mpWithoutFeeTrace = parsedOrders.filter((order) => order.mp_without_fee_trace);

  return {
    orders: parsedOrders,
    summary: {
      reviewed_orders: parsedOrders.length,
      mp_orders: mpOrders.length,
      mp_approved_orders: mpApproved.length,
      traced_orders: parsedOrders.filter((order) => order.has_fee_trace).length,
      fee_orders: withFee.length,
      approved_fee_orders: approved.length,
      pending_fee_orders: pending.length,
      mp_without_fee_trace_orders: mpWithoutFeeTrace.length,
      registered_fee_total: withFee.reduce((total, order) => total + order.marketplace_fee, 0),
      approved_fee_total: approved.reduce((total, order) => total + order.marketplace_fee, 0),
      pending_fee_total: pending.reduce((total, order) => total + order.marketplace_fee, 0),
    },
  };
};
