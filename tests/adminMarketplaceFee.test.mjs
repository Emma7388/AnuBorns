import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseMarketplaceFeeTrace,
  summarizeMarketplaceFeeOrders,
} from "../src/lib/adminMarketplaceFee.js";

test("parsea marketplace_fee desde payment_detail", () => {
  const trace = parseMarketplaceFeeTrace("mp_preference|marketplace_fee:1|marketplace:omitted|oauth_seller:257559702");

  assert.equal(trace.hasTrace, true);
  assert.equal(trace.marketplaceFee, 1);
  assert.equal(trace.marketplace, "omitted");
  assert.equal(trace.oauthSeller, "257559702");
});

test("resume fee aprobado y registrado sin contar rechazadas como aprobadas", () => {
  const { summary } = summarizeMarketplaceFeeOrders([
    {
      status: "approved",
      payment_status: "approved",
      payment_id: "mp-1",
      payment_detail: "mp_preference|marketplace_fee:1|marketplace:omitted|oauth_seller:1",
    },
    {
      status: "pending",
      payment_status: "pending",
      payment_detail: "mp_preference|marketplace_fee:2|marketplace:omitted|oauth_seller:2",
    },
    {
      status: "rejected",
      payment_status: "rejected",
      payment_id: "mp-3",
      payment_detail: "mp_preference|marketplace_fee:3|marketplace:omitted|oauth_seller:3",
    },
    {
      status: "approved",
      payment_status: "approved",
      payment_id: "mp-4",
      payment_detail: "accredited",
    },
  ]);

  assert.equal(summary.fee_orders, 3);
  assert.equal(summary.approved_fee_orders, 1);
  assert.equal(summary.pending_fee_orders, 1);
  assert.equal(summary.mp_approved_orders, 2);
  assert.equal(summary.mp_without_fee_trace_orders, 1);
  assert.equal(summary.registered_fee_total, 6);
  assert.equal(summary.approved_fee_total, 1);
  assert.equal(summary.pending_fee_total, 2);
});
