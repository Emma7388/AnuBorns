import assert from "node:assert/strict";
import test from "node:test";
import { applyPublicationPayment } from "../src/lib/publicationPayments.js";

const makeSupabase = ({ record, product = {} }) => {
  const updates = [];
  return {
    updates,
    from(table) {
      let operation = "select";
      let payload = null;
      const builder = {
        select() { return this; },
        update(value) {
          operation = "update";
          payload = value;
          updates.push({ table, value });
          return this;
        },
        eq() { return this; },
        maybeSingle() {
          if (table === "product_publication_payments" && operation === "select") {
            return Promise.resolve({ data: record, error: null });
          }
          if (table === "products") {
            return Promise.resolve({ data: { id: record.product_id, ...product }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: payload, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
};

const baseRecord = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  product_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  amount: 2000,
  currency: "ARS",
  payment_id: "123",
};

const approvedPayment = {
  id: "123",
  external_reference: `publication:${baseRecord.id}`,
  transaction_amount: 2000,
  currency_id: "ARS",
  status: "approved",
};

test("un webhook aprobado repetido repara la activación sin extender los 30 días", async () => {
  const approvedAt = "2026-10-11T12:00:00.000Z";
  const supabase = makeSupabase({ record: { ...baseRecord, status: "approved", approved_at: approvedAt } });
  const result = await applyPublicationPayment(supabase, approvedPayment);
  const productUpdate = supabase.updates.find((entry) => entry.table === "products");

  assert.equal(result.ok, true);
  assert.equal(productUpdate.value.publication_started_at, approvedAt);
  assert.equal(productUpdate.value.publication_expires_at, "2026-11-10T12:00:00.000Z");
});

test("una aprobación vieja no reactiva una publicación ya reembolsada", async () => {
  const approvedAt = "2026-10-11T12:00:00.000Z";
  const supabase = makeSupabase({
    record: { ...baseRecord, status: "refunded", approved_at: approvedAt },
    product: { publication_started_at: approvedAt },
  });
  const result = await applyPublicationPayment(supabase, approvedPayment);
  const productUpdate = supabase.updates.find((entry) => entry.table === "products");

  assert.equal(result.paymentStatus, "refunded");
  assert.equal(productUpdate.value.publication_status, "cancelled");
});

test("un pago mensual válido activa la publicación por exactamente 30 días", async () => {
  const supabase = makeSupabase({ record: { ...baseRecord, status: "pending", payment_id: null, approved_at: null } });
  const result = await applyPublicationPayment(supabase, approvedPayment);
  const paymentUpdate = supabase.updates.find((entry) => entry.table === "product_publication_payments");
  const productUpdate = supabase.updates.find((entry) => entry.table === "products");

  assert.equal(result.ok, true);
  assert.equal(paymentUpdate.value.status, "approved");
  assert.equal(
    Date.parse(productUpdate.value.publication_expires_at) - Date.parse(productUpdate.value.publication_started_at),
    30 * 24 * 60 * 60 * 1000,
  );
});

test("un webhook repetido conserva el pago si el producto ya fue eliminado", async () => {
  const supabase = makeSupabase({
    record: { ...baseRecord, product_id: null, status: "approved", approved_at: "2026-10-11T12:00:00.000Z" },
  });
  const result = await applyPublicationPayment(supabase, approvedPayment);

  assert.equal(result.ok, true);
  assert.equal(result.publicationStatus, "deleted");
  assert.equal(supabase.updates.length, 0);
});
