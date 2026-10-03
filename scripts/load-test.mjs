#!/usr/bin/env node
// Zenora load test: no dependencies, Node 20+.
//
//   node scripts/load-test.mjs --api http://localhost:4000 --email you@x.co --password '...' \
//        --workspace <id> [--concurrency 20] [--seconds 15] [--only leads,inbox]
//
// Signs in once, then drives each scenario with N concurrent virtual users for
// a fixed time and reports throughput and latency percentiles. Run it against
// a staging copy, never production: some scenarios create data (they tag it so
// it can be removed: source = "loadtest").
//
// Results measure the whole path (HTTP, auth guards, database). Run it from a
// machine in the same region as the database, or the network round trip to the
// database dominates every number.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]] : acc), [])
);

const API = args.api ?? "http://localhost:4000";
const CONCURRENCY = Number(args.concurrency ?? 20);
const SECONDS = Number(args.seconds ?? 15);
const WS = args.workspace;
const ONLY = args.only ? new Set(args.only.split(",")) : null;

if (!args.email || !args.password || !WS) {
  console.error("Required: --email, --password, --workspace (see the header of this file)");
  process.exit(1);
}

async function login() {
  const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: args.email, password: args.password }) });
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Login returned no session cookie");
  return cookie;
}

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

async function run(name, request) {
  const latencies = [];
  const statuses = new Map();
  let errors = 0;
  const stopAt = Date.now() + SECONDS * 1000;

  async function worker(id) {
    let n = 0;
    while (Date.now() < stopAt) {
      const started = performance.now();
      try {
        const res = await request(id, n++);
        await res.arrayBuffer();
        statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
        if (res.status >= 500) errors++;
      } catch {
        errors++;
        statuses.set("network", (statuses.get("network") ?? 0) + 1);
      }
      latencies.push(performance.now() - started);
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  const elapsed = (Date.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const row = {
    scenario: name,
    requests: latencies.length,
    "req/s": Math.round(latencies.length / elapsed),
    "p50 ms": Math.round(percentile(latencies, 50)),
    "p95 ms": Math.round(percentile(latencies, 95)),
    "p99 ms": Math.round(percentile(latencies, 99)),
    "max ms": Math.round(latencies[latencies.length - 1] ?? 0),
    "5xx/net": errors,
    statuses: [...statuses.entries()].map(([k, v]) => `${k}:${v}`).join(" ")
  };
  console.log(`  ${name}: ${row["req/s"]} req/s, p50 ${row["p50 ms"]} ms, p95 ${row["p95 ms"]} ms, p99 ${row["p99 ms"]} ms, errors ${errors}`);
  return row;
}

const cookie = await login();
const authed = (path, init = {}) => fetch(`${API}${path}`, { ...init, headers: { cookie, "content-type": "application/json", ...init.headers } });

// Pick ids to read individually.
const leadList = await (await authed(`/leads/${WS}`)).json();
const leadIds = Array.isArray(leadList) ? leadList.map((l) => l.id) : [];
const conversations = await (await authed(`/inbox/${WS}/conversations`)).json().catch(() => []);
const convIds = Array.isArray(conversations) ? conversations.map((c) => c.id) : [];

const SCENARIOS = {
  health: () => run("health (no auth, no database)", () => fetch(`${API}/health`)),
  session: () => run("auth/me (session + 1 query)", () => authed("/auth/me")),
  leads: () => run("GET leads list (200 rows + tags)", () => authed(`/leads/${WS}`)),
  lead: () => run("GET one lead (with relations)", (_, n) => authed(`/leads/${WS}/${leadIds[n % Math.max(1, leadIds.length)] ?? "none"}`)),
  inbox: () => run("GET inbox conversations", () => authed(`/inbox/${WS}/conversations`)),
  messages: () => run("GET one conversation's messages", (_, n) => authed(`/inbox/${WS}/conversations/${convIds[n % Math.max(1, convIds.length)] ?? "none"}/messages`)),
  pipelines: () => run("GET pipelines", () => authed(`/pipelines/${WS}`)),
  reports: () => run("GET bot drop-off report", () => authed(`/reports/${WS}/bot-dropoff`)),
  tasks: () => run("GET tasks", () => authed(`/tasks/${WS}`)),
  createlead: () =>
    run("POST create lead (write)", (worker, n) =>
      authed(`/leads/${WS}`, { method: "POST", body: JSON.stringify({ name: `Load ${worker}-${n}`, phone: `9199${String(Date.now()).slice(-6)}${worker}${n % 10}`, source: "loadtest" }) })
    ),
  webhook: () =>
    run("POST Meta webhook ingestion (WhatsApp)", (worker, n) =>
      fetch(`${API}/webhooks/meta`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "load", changes: [{ field: "messages", value: { metadata: { phone_number_id: "nonexistent_load_test" }, messages: [{ id: `wamid.load.${Date.now()}.${worker}.${n}`, from: "919100000000", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "hi" } }] } }] }] })
      })
    )
};

console.log(`Load test: ${CONCURRENCY} concurrent users x ${SECONDS}s per scenario against ${API}`);
const rows = [];
for (const [key, scenario] of Object.entries(SCENARIOS)) {
  if (ONLY && !ONLY.has(key)) continue;
  rows.push(await scenario());
}
console.log("\nSummary");
console.table(rows);
if (rows.some((r) => r["5xx/net"] > 0)) process.exitCode = 2;
