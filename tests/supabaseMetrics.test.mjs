import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSupabasePlanUsageSnapshot,
  buildSupabaseMetricsSnapshot,
  parsePrometheusMetrics,
} from "../src/lib/supabaseMetrics.js";

const SAMPLE_METRICS = `
# HELP node_memory_MemTotal_bytes Memory information field MemTotal_bytes.
# TYPE node_memory_MemTotal_bytes gauge
node_memory_MemTotal_bytes{supabase_project_ref="demo",service_type="db"} 1000
node_memory_MemAvailable_bytes{supabase_project_ref="demo",service_type="db"} 350
node_memory_SwapTotal_bytes{supabase_project_ref="demo",service_type="db"} 500
node_memory_SwapFree_bytes{supabase_project_ref="demo",service_type="db"} 500
node_filesystem_size_bytes{supabase_project_ref="demo",service_type="db",mountpoint="/"} 2000
node_filesystem_avail_bytes{supabase_project_ref="demo",service_type="db",mountpoint="/"} 800
node_load5{supabase_project_ref="demo",service_type="db"} 0.7
node_cpu_seconds_total{supabase_project_ref="demo",service_type="db",cpu="0",mode="idle"} 123
node_cpu_seconds_total{supabase_project_ref="demo",service_type="db",cpu="1",mode="idle"} 123
node_disk_io_now{supabase_project_ref="demo",service_type="db",device="disk-a"} 1
node_disk_io_now{supabase_project_ref="demo",service_type="db",device="disk-b"} 2
db_sql_connection_open{supabase_project_ref="demo",service_type="gotrue",status="idle"} 4
db_sql_connection_open{supabase_project_ref="demo",service_type="gotrue",status="inuse"} 1
postgresql_restarts_total{supabase_project_ref="demo",service_type="db"} 0
pg_database_size_mb{supabase_project_ref="demo",datname="postgres"} 31
`;

test("parsea muestras Prometheus con labels", () => {
  const samples = parsePrometheusMetrics(SAMPLE_METRICS);

  assert.ok(samples.length > 0);
  assert.deepEqual(
    samples.find((sample) => sample.name === "node_load5")?.labels,
    { supabase_project_ref: "demo", service_type: "db" },
  );
});

test("construye snapshot de mediciones principales", () => {
  const snapshot = buildSupabaseMetricsSnapshot(parsePrometheusMetrics(SAMPLE_METRICS), {
    projectRef: "demo",
  });

  const memory = snapshot.items.find((item) => item.id === "memory-used");
  const disk = snapshot.items.find((item) => item.id === "disk-used");
  const io = snapshot.items.find((item) => item.id === "disk-io-now");
  const connections = snapshot.items.find((item) => item.id === "db-open-connections");

  assert.equal(snapshot.configured, true);
  assert.equal(memory.value, 65);
  assert.equal(memory.status, "ok");
  assert.equal(disk.value, 60);
  assert.equal(io.value, 3);
  assert.equal(connections.value, 5);
  assert.equal(snapshot.raw.databaseSizeBytes.value, 31 * 1024 * 1024);
});

test("marca swap como error recien desde 80 por ciento", () => {
  const buildSwapSample = (free) => parsePrometheusMetrics(`
node_memory_SwapTotal_bytes{supabase_project_ref="demo",service_type="db"} 100
node_memory_SwapFree_bytes{supabase_project_ref="demo",service_type="db"} ${free}
`);

  const warningSnapshot = buildSupabaseMetricsSnapshot(buildSwapSample(50), {
    projectRef: "demo",
  });
  const errorSnapshot = buildSupabaseMetricsSnapshot(buildSwapSample(20), {
    projectRef: "demo",
  });

  assert.equal(warningSnapshot.items.find((item) => item.id === "swap-used").status, "warning");
  assert.equal(errorSnapshot.items.find((item) => item.id === "swap-used").status, "error");
});

test("marca disco como error recien desde 95 por ciento", () => {
  const buildDiskSample = (available) => parsePrometheusMetrics(`
node_filesystem_size_bytes{supabase_project_ref="demo",service_type="db",mountpoint="/"} 100
node_filesystem_avail_bytes{supabase_project_ref="demo",service_type="db",mountpoint="/"} ${available}
`);

  const okSnapshot = buildSupabaseMetricsSnapshot(buildDiskSample(20), {
    projectRef: "demo",
  });
  const warningSnapshot = buildSupabaseMetricsSnapshot(buildDiskSample(15), {
    projectRef: "demo",
  });
  const errorSnapshot = buildSupabaseMetricsSnapshot(buildDiskSample(5), {
    projectRef: "demo",
  });

  assert.equal(okSnapshot.items.find((item) => item.id === "disk-used").status, "ok");
  assert.equal(warningSnapshot.items.find((item) => item.id === "disk-used").status, "warning");
  assert.equal(errorSnapshot.items.find((item) => item.id === "disk-used").status, "error");
});

test("construye uso del plan con datos livianos disponibles", async () => {
  const snapshot = buildSupabaseMetricsSnapshot(parsePrometheusMetrics(SAMPLE_METRICS), {
    projectRef: "demo",
  });
  const supabaseAdmin = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              { last_sign_in_at: new Date().toISOString() },
              { last_sign_in_at: "2020-01-01T00:00:00.000Z" },
            ],
          },
          error: null,
        }),
      },
    },
    storage: {
      listBuckets: async () => ({
        data: [{ id: "product-images" }],
        error: null,
      }),
      from: () => ({
        list: async (path) => ({
          data: path
            ? [
                { name: "image-1.jpg", metadata: { size: 1200 } },
                { name: "image-2.jpg", metadata: { size: 800 } },
              ]
            : [{ name: "user-1", metadata: null }],
          error: null,
        }),
      }),
    },
  };

  const usage = await buildSupabasePlanUsageSnapshot({ supabaseAdmin, metrics: snapshot });
  const database = usage.items.find((item) => item.id === "usage-database-size");
  const storage = usage.items.find((item) => item.id === "usage-file-storage");
  const mau = usage.items.find((item) => item.id === "usage-monthly-active-users");
  const egress = usage.unavailable.find((item) => item.id === "usage-egress");

  assert.equal(database.status, "ok");
  assert.equal(storage.meta.objectCount, 2);
  assert.equal(storage.meta.used, 2000);
  assert.equal(mau.value_display, "1 / 50.000");
  assert.equal(egress.limit_display, "5 GB");
});
