import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
});
