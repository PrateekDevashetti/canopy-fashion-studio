import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { closeDb, db } from "../db/client.ts";
import { assets, creditLedger, runs, users } from "../db/schema.ts";
import { chargeRun, creditsToCents, holdPlatformCredits, platformBalance, releasePlatformHold, settlePendingHolds, settlePlatformHold, settleRun, type CreditHold } from "../platform-credits.ts";
import { CENTS_PER_CREDIT, platformCredits } from "../tools/registry.ts";

// Platform credits (platform-credits.ts): a run is paid from the person's
// Canopy wallet when there is one to charge, and from the studio's own ledger
// when there is not; never both. Canopy is stood in by a stubbed fetch. The
// tests that write rows run only against a local Postgres.

type Reply = { status: number; body?: unknown } | Error;
const calls: { url: string; method: string; auth: string | null; body: Record<string, unknown> | null }[] = [];
function stubCanopy(replies: Reply[] | ((url: string) => Reply)) {
  calls.length = 0;
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", auth: new Headers(init?.headers).get("authorization"), body: init?.body ? JSON.parse(String(init.body)) : null });
    const reply = typeof replies === "function" ? replies(url) : replies[Math.min(i++, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
const HOLD: CreditHold = { id: "h_0f8c2b1e-1d2c-4a3b-9c8d-7e6f5a4b3c2d", sig: "s".repeat(32), cents: 18 };
const held = { status: 200, body: { enforced: true, holdId: HOLD.id, sig: HOLD.sig, reservedCents: 18 } };

test("one tool credit is three cents, shown as Canopy shows credits", () => {
  assert.equal(CENTS_PER_CREDIT, 3);
  assert.equal(creditsToCents(6), 18);
  assert.equal(creditsToCents(40), 120);
  assert.equal(platformCredits(6), "0.18");
  assert.equal(platformCredits(40), "1.20");
  assert.equal(platformCredits(2000 / 3), "20.00", "a $20 wallet reads 20.00, as it does in Canopy");
});

test("a run holds its cost on the person's Canopy wallet with their token", async () => {
  stubCanopy([held]);
  const out = await holdPlatformCredits("tok", { credits: 6, reason: "Sketch to render", ref: "run_1" });
  assert.deepEqual(out, { kind: "held", hold: HOLD });
  assert.match(calls[0].url, /\/api\/billing\/holds$/);
  assert.equal(calls[0].auth, "Bearer tok");
  assert.deepEqual(calls[0].body, { cents: 18, app: "fashion-studio", reason: "Sketch to render", ref: "run_1" });
});

test("what Canopy answers decides who pays: an unlimited account, an empty wallet, or the studio's own ledger", async () => {
  stubCanopy([{ status: 200, body: { enforced: false, holdId: null, sig: null, unlimited: true } }]);
  assert.deepEqual(await holdPlatformCredits("tok", { credits: 6, reason: "x", ref: "r" }), { kind: "unlimited" });
  stubCanopy([{ status: 402, body: { error: { code: "ACCOUNT_CREDITS_EXHAUSTED" } } }]);
  assert.deepEqual(await holdPlatformCredits("tok", { credits: 6, reason: "x", ref: "r" }), { kind: "insufficient" });
  // Canopy not charging for generation must not make the studio free for all.
  stubCanopy([{ status: 200, body: { enforced: false, holdId: null, sig: null } }]);
  assert.equal((await holdPlatformCredits("tok", { credits: 6, reason: "x", ref: "r" })).kind, "unavailable");
  for (const reply of [{ status: 404 }, { status: 401 }, { status: 503 }, new Error("fetch failed")] as Reply[]) {
    stubCanopy([reply]);
    assert.equal((await holdPlatformCredits("tok", { credits: 6, reason: "x", ref: "r" })).kind, "unavailable");
  }
  stubCanopy([held]);
  assert.equal((await holdPlatformCredits(null, { credits: 6, reason: "x", ref: "r" })).kind, "unavailable", "no session, no wallet");
  assert.equal(calls.length, 0);
});

test("chargeRun keeps the hold for the run, and an empty wallet is a 402 in platform credits", async () => {
  stubCanopy([held]);
  assert.deepEqual(await chargeRun({ userId: "u", credits: 6, reason: "Sketch to render", runId: "run_1", platformToken: "tok" }), { via: "platform", hold: HOLD });
  stubCanopy([{ status: 200, body: { enforced: false, unlimited: true } }]);
  assert.deepEqual(await chargeRun({ userId: "u", credits: 6, reason: "x", runId: "run_2", platformToken: "tok" }), { via: "platform" });
  stubCanopy([{ status: 402 }]);
  await assert.rejects(
    () => chargeRun({ userId: "u", credits: 6, reason: "x", runId: "run_3", platformToken: "tok" }),
    (e: Error & { status?: number }) => e.status === 402 && /needs 0\.18\./.test(e.message),
  );
});

test("ending a hold: settle is capped at the hold, a lost hold is not retried, an outage is", async () => {
  stubCanopy([{ status: 200, body: { chargedCents: 18 } }]);
  assert.equal(await settlePlatformHold(HOLD, 999), true);
  assert.match(calls[0].url, new RegExp(`/api/billing/holds/${HOLD.id}/settle$`));
  assert.deepEqual(calls[0].body, { sig: HOLD.sig, cents: 18 });
  assert.equal(calls[0].auth, null, "the signature is the credential: the worker has no person's token");
  stubCanopy([{ status: 404 }]);
  assert.equal(await releasePlatformHold(HOLD), true, "nothing there to end");
  assert.equal(calls.length, 1);
  stubCanopy([new Error("fetch failed"), { status: 503 }, { status: 200 }]);
  assert.equal(await releasePlatformHold(HOLD), true, "third try lands");
  assert.equal(calls.length, 3);
  stubCanopy(() => ({ status: 503 }));
  assert.equal(await settlePlatformHold(HOLD, 6), false, "still open: the sweep will retry");
});

test("the balance is the Canopy wallet only when Canopy is charging; else the studio's ledger is shown", async () => {
  stubCanopy([{ status: 200, body: { balanceCents: 2000, enforced: true } }]);
  const wallet = await platformBalance("tok");
  assert.equal(platformCredits(wallet!.credits), "20.00");
  assert.equal(wallet!.unlimited, false);
  assert.equal(calls[0].method, "GET");
  stubCanopy([{ status: 200, body: { balanceCents: 2000 } }]);
  assert.equal(await platformBalance("tok"), null, "a Canopy that does not say it enforces is not the wallet in force");
  stubCanopy([{ status: 200, body: { unlimited: true, balanceCents: 2_000_000_000 } }]);
  assert.equal((await platformBalance("tok"))!.unlimited, true);
  stubCanopy([new Error("fetch failed")]);
  assert.equal(await platformBalance("tok"), null);
  assert.equal(await platformBalance(null), null);
});

// ── Against a local Postgres only ───────────────────────────────────────────

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/fashion_studio";
const local = /localhost|127\.0\.0\.1/.test(url);
const reachable = local && (await db().select({ id: users.id }).from(users).limit(1).then(() => true, () => false));
const skip = reachable ? false : "needs a local Postgres with the studio schema";
const USER = "pc_test_user";
const RUNS = ["pc_run_hold", "pc_run_ledger", "pc_run_stuck", "pc_run_failed"];

async function clean() {
  if (!reachable) return;
  await db().delete(assets).where(inArray(assets.runId, RUNS));
  await db().delete(creditLedger).where(eq(creditLedger.userId, USER));
  await db().delete(runs).where(inArray(runs.id, RUNS));
  await db().delete(users).where(eq(users.id, USER));
}
after(async () => {
  await clean();
  await closeDb();
});

const seedRun = (id: string, extra: Partial<typeof runs.$inferInsert> = {}) =>
  db().insert(runs).values({ id, projectId: "pc_project", userId: USER, tool: "prompt", status: "succeeded", cost: 12, expected: 2, finishedAt: new Date(Date.now() - 5 * 60_000), ...extra });
const runRow = async (id: string) => (await db().select().from(runs).where(eq(runs.id, id)))[0];
const credits = async () => (await db().select({ credits: users.credits }).from(users).where(eq(users.id, USER)))[0].credits;

test("a platform run settles for what it made and the hold comes off the run, once", { skip }, async () => {
  await clean();
  await db().insert(users).values({ id: USER, credits: 20 });
  await seedRun("pc_run_hold", { providerRef: { queue: { id: "fal-1" }, billing: { via: "platform", hold: { ...HOLD, cents: 36 } } } });
  stubCanopy([{ status: 200, body: { chargedCents: 18 } }]);
  await settleRun(await runRow("pc_run_hold"), 1, "partial refund");
  assert.deepEqual(calls[0].body, { sig: HOLD.sig, cents: 18 }, "one of two outputs: half of 12 credits is 18 cents");
  const after = await runRow("pc_run_hold");
  assert.deepEqual(after.providerRef, { queue: { id: "fal-1" }, billing: { via: "platform", chargedCents: 18 } }, "the hold is gone, the rest of provider_ref is kept");
  assert.equal(await credits(), 20, "the studio's ledger is not touched");
  stubCanopy([{ status: 200 }]);
  await settleRun(after, 1, "partial refund");
  assert.equal(calls.length, 0, "an ended hold is never ended again");
});

test("a platform run that made nothing releases its whole hold", { skip }, async () => {
  await seedRun("pc_run_failed", { status: "failed", providerRef: { billing: { via: "platform", hold: HOLD } } });
  stubCanopy([{ status: 200 }]);
  await settleRun(await runRow("pc_run_failed"), 0, "refund");
  assert.match(calls[0].url, /\/release$/);
  assert.deepEqual((await runRow("pc_run_failed")).providerRef, { billing: { via: "platform", chargedCents: 0 } });
});

test("a ledger run is refunded on the studio's ledger, as before", { skip }, async () => {
  await seedRun("pc_run_ledger");
  stubCanopy([{ status: 500 }]);
  await settleRun(await runRow("pc_run_ledger"), 1, "partial refund");
  assert.equal(calls.length, 0, "Canopy is not involved");
  assert.equal(await credits(), 26, "half of 12 credits came back");
});

test("a hold Canopy could not be told about stays on the run, and the sweep ends it later", { skip }, async () => {
  await seedRun("pc_run_stuck", { providerRef: { billing: { via: "platform", hold: { ...HOLD, cents: 36 } } } });
  await db().insert(assets).values({ id: "pc_asset_1", projectId: "pc_project", userId: USER, runId: "pc_run_stuck", kind: "result", storageKey: "pc/1.png", mime: "image/png" });
  stubCanopy(() => ({ status: 503 }));
  await settleRun(await runRow("pc_run_stuck"), 1, "partial refund");
  assert.ok((await runRow("pc_run_stuck")).providerRef.billing, "still on the run");
  assert.ok((((await runRow("pc_run_stuck")).providerRef as { billing: { hold?: unknown } }).billing.hold), "with its hold");
  stubCanopy(() => ({ status: 200 }));
  const swept = await settlePendingHolds();
  assert.ok(swept >= 1);
  assert.ok(calls.some((c) => c.url.endsWith(`/${HOLD.id}/settle`) && c.body?.cents === 18), "settled for the one output found on the run");
  assert.deepEqual((await runRow("pc_run_stuck")).providerRef, { billing: { via: "platform", chargedCents: 18 } });
});
