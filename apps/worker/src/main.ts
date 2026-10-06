/**
 * Fashion Studio generation worker (Railway).
 * Claims queued runs from Postgres (FOR UPDATE SKIP LOCKED — safe with many replicas and with the
 * web app's inline fallback), executes them, and recovers runs orphaned by crashes.
 */
import http from "node:http";
import { claimNext, executeRun, recoverStale, purgeDeleted, closeDb } from "@fashion/core";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 6);
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 1500);
let active = 0;
let stopping = false;
let lastTick = Date.now();
let processed = 0;

async function pump() {
  while (!stopping && active < CONCURRENCY) {
    const run = await claimNext().catch((e) => {
      console.error("[worker] claim failed:", e.message);
      return null;
    });
    if (!run) break;
    active++;
    console.log(`[worker] ▶ ${run.id} ${run.tool} (attempt ${run.attempts})`);
    const t = Date.now();
    executeRun(run)
      .catch((e) => console.error(`[worker] ${run.id} crashed:`, e))
      .finally(() => {
        active--;
        processed++;
        console.log(`[worker] ■ ${run.id} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
        void pump();
      });
  }
}

async function loop() {
  while (!stopping) {
    lastTick = Date.now();
    await pump();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

setInterval(() => {
  recoverStale().then((n) => n && console.log(`[worker] recovered ${n} stale runs`)).catch(() => {});
}, 60_000);
setInterval(() => {
  purgeDeleted().then((n) => n && console.log(`[worker] purged ${n} deleted assets`)).catch(() => {});
}, 30 * 60_000);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    const healthy = Date.now() - lastTick < 60_000;
    res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: healthy, active, processed, concurrency: CONCURRENCY }));
    return;
  }
  res.writeHead(404).end();
});
server.listen(Number(process.env.PORT ?? 8080), () => console.log(`[worker] up — concurrency ${CONCURRENCY}`));

async function shutdown() {
  stopping = true;
  console.log("[worker] draining…");
  const until = Date.now() + 25_000;
  while (active > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 500));
  server.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

void loop();
