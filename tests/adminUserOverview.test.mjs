import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdminUserOverview,
  buildAdminUserTimeline,
  getAdminMercadoPagoDiagnostic,
  getAdminProductVisibility,
} from "../src/lib/adminUserOverview.js";

test("la visibilidad exige publicación activa, stock y vigencia mensual", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  assert.deepEqual(getAdminProductVisibility({ publication_status: "active", publication_type: "permanent", stock: 1 }, now), {
    visible: true,
    reason: "visible",
  });
  assert.equal(getAdminProductVisibility({ publication_status: "active", publication_type: "permanent", stock: 0 }, now).reason, "sin_stock");
  assert.equal(getAdminProductVisibility({ publication_status: "active", publication_type: "monthly", stock: 2, publication_expires_at: "2026-10-11T12:00:00Z" }, now).reason, "vencida");
});

test("el diagnóstico Mercado Pago no expone tokens y reconoce la excepción autorizada", () => {
  const result = getAdminMercadoPagoDiagnostic({
    connection: { mp_user_id: "1157622469", access_token: "secreto", expires_at: "2026-11-01T00:00:00Z" },
    mpAccount: { id: "1157622469", first_name: "Cuenta", last_name: "Exceptuada" },
    profile: { first_name: "Nombre", last_name: "Distinto" },
    authUser: { email: "usuario@example.com" },
    now: Date.parse("2026-10-12T12:00:00Z"),
  });
  assert.equal(result.identity_exception, true);
  assert.equal(result.identity_matches, true);
  assert.equal(result.live_status, "verified");
  assert.equal("access_token" in result, false);
  assert.equal(JSON.stringify(result).includes("secreto"), false);
});

test("la ficha resume estados y entregas pendientes", () => {
  const result = buildAdminUserOverview({
    products: [{ id: "p1", publication_status: "active", publication_type: "permanent", stock: 1 }],
    purchases: [{ id: "o1", status: "pending" }, { id: "o2", status: "approved" }],
    sales: [
      { order_id: "s1", status: "approved", fulfillment_status: "requested" },
      { order_id: "s2", status: "approved", fulfillment_status: "completed" },
    ],
  });
  assert.equal(result.summary.visible_publications, 1);
  assert.equal(result.summary.purchase_statuses.pending, 1);
  assert.equal(result.summary.sales, 2);
  assert.equal(result.summary.pending_fulfillment, 1);
  assert.equal(result.summary.incidents, 1);
});

test("la cronología combina actividad y ordena de más reciente a más antigua", () => {
  const timeline = buildAdminUserTimeline({
    products: [{ title: "Producto", publication_status: "active", created_at: "2026-10-10T10:00:00Z" }],
    purchases: [{ id: "orden", status: "approved", created_at: "2026-10-12T10:00:00Z" }],
    audit: [{ label: "Perfil actualizado", created_at: "2026-10-11T10:00:00Z" }],
  });
  assert.deepEqual(timeline.map((item) => item.type), ["purchase", "audit", "publication"]);
});
