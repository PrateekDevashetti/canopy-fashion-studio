// ── Platform credits ─────────────────────────────────────────────────────────
// Fashion Studio's runs spend from Canopy's platform wallet (the same credits as
// everything else in Canopy) when the person is signed in with Clerk and Canopy
// is charging for generation. A run holds its cost on their workspace wallet as
// it is created, with their session token (canopy-api POST /api/billing/holds);
// the worker settles what was made, or releases the hold, with the hold's
// signature, because it has no person's session.
//
// The studio's own ledger (users.credits) stays as the brake wherever there is
// no platform wallet to charge: the local dev user, a Canopy API that predates
// holds or cannot be reached, and a Canopy that is not enforcing credits. It is
// never both for one run: how a run was paid is written on the run.
//
// The hold lives on the run's provider_ref, which is never serialized to a
// browser. Its signature can release the hold, so it must not leave the server.
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "./db/client";
import { assets, runs, type RunRow } from "./db/schema";
import { debitCredits, HttpError, refundCredits } from "./data";
import { CENTS_PER_CREDIT, platformCredits } from "./tools/registry";

export type CreditHold = { id: string; sig: string; cents: number };
/** How a run is paid when the platform pays: with a hold still to end, or with nothing to end. */
export type RunBilling = { via: "platform"; hold?: CreditHold; chargedCents?: number };

const api = () => (process.env.CANOPY_API_URL ?? "https://api.trycanopy.space").replace(/\/$/, "");
export const creditsToCents = (credits: number) => Math.ceil(credits * CENTS_PER_CREDIT);

/** Structured billing event, as security events are: one JSON line, no secrets. */
const billingEvent = (event: string, extra: Record<string, unknown> = {}) => console.warn(JSON.stringify({ level: "billing", event, ...extra }));

function call(path: string, init: { method?: "GET" | "POST"; token?: string | null; body?: unknown }) {
  return fetch(`${api()}${path}`, {
    method: init.method ?? "POST",
    headers: { ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
}

export type HoldOutcome =
  | { kind: "held"; hold: CreditHold }
  /** An account the platform never charges. */
  | { kind: "unlimited" }
  | { kind: "insufficient" }
  /** No platform wallet to charge: the studio's own ledger pays. */
  | { kind: "unavailable"; why: string };

/** Hold a run's cost on the person's Canopy wallet. Never throws. */
export async function holdPlatformCredits(token: string | null | undefined, input: { credits: number; reason: string; ref: string }): Promise<HoldOutcome> {
  if (!token) return { kind: "unavailable", why: "no session token" };
  const cents = creditsToCents(input.credits);
  try {
    const res = await call("/api/billing/holds", { token, body: { cents, app: "fashion-studio", reason: input.reason.slice(0, 80), ref: input.ref } });
    if (res.status === 402) return { kind: "insufficient" };
    if (!res.ok) return { kind: "unavailable", why: `holds answered ${res.status}` };
    const j = (await res.json()) as { enforced?: boolean; holdId?: string | null; sig?: string | null; unlimited?: boolean };
    if (j.enforced && j.holdId && j.sig) return { kind: "held", hold: { id: j.holdId, sig: j.sig, cents } };
    if (j.unlimited) return { kind: "unlimited" };
    // Canopy is not charging for generation here. The studio's own credits stay
    // the brake, so a platform switch can never make this studio free for all.
    return { kind: "unavailable", why: "the platform is not enforcing credits" };
  } catch (e) {
    return { kind: "unavailable", why: (e as Error).message.slice(0, 120) };
  }
}

/** End a hold. True when it is ended or can never be (so nothing is left to retry). */
async function endHold(hold: CreditHold, how: "settle" | "release", cents = 0): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await call(`/api/billing/holds/${hold.id}/${how}`, { body: how === "settle" ? { sig: hold.sig, cents } : { sig: hold.sig } });
      if (res.ok) return true;
      if (res.status === 400 || res.status === 404) {
        billingEvent("hold_rejected", { hold: hold.id, how, status: res.status });
        return true;
      }
    } catch {
      /* try again below */
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  billingEvent("hold_end_failed", { hold: hold.id, how });
  return false;
}
export const settlePlatformHold = (hold: CreditHold, cents: number) => endHold(hold, "settle", Math.max(0, Math.min(hold.cents, Math.ceil(cents))));
export const releasePlatformHold = (hold: CreditHold) => endHold(hold, "release");

/**
 * The person's Canopy wallet in tool credits (it can be fractional), or null
 * when the studio's own ledger is what a run would spend: no token, Canopy out
 * of reach, or Canopy not charging for generation.
 */
export async function platformBalance(token: string | null | undefined): Promise<{ credits: number; unlimited: boolean } | null> {
  if (!token) return null;
  try {
    const res = await call("/api/billing/credits", { method: "GET", token });
    if (!res.ok) return null;
    const j = (await res.json()) as { balanceCents?: number; enforced?: boolean; unlimited?: boolean };
    // A balance no comparison can fall under, as well as the flag the screens read.
    if (j.unlimited) return { credits: 1e9, unlimited: true };
    if (!j.enforced || typeof j.balanceCents !== "number") return null;
    return { credits: Math.max(0, j.balanceCents) / CENTS_PER_CREDIT, unlimited: false };
  } catch {
    return null;
  }
}

const notEnough = (credits: number) => new HttpError(402, `Not enough credits — this run needs ${platformCredits(credits)}.`);

/**
 * Pay for a run that is about to be created: on the platform wallet when there
 * is one, else on the studio's ledger. Returns what to keep on the run (null
 * for the ledger), or throws 402.
 */
export async function chargeRun(input: { userId: string; credits: number; reason: string; runId: string; platformToken?: string | null }): Promise<RunBilling | null> {
  if (input.credits > 0 && input.platformToken) {
    const out = await holdPlatformCredits(input.platformToken, { credits: input.credits, reason: input.reason, ref: input.runId });
    if (out.kind === "held") return { via: "platform", hold: out.hold };
    if (out.kind === "unlimited") return { via: "platform" };
    if (out.kind === "insufficient") throw notEnough(input.credits);
    billingEvent("platform_unavailable", { run: input.runId, why: out.why });
  }
  if (!(await debitCredits(input.userId, input.credits, input.reason, input.runId))) throw notEnough(input.credits);
  return null;
}

/** Undo `chargeRun` for a run that was never created. */
export async function unchargeRun(billing: RunBilling | null, input: { userId: string; credits: number; runId: string }) {
  if (!billing) return refundCredits(input.userId, input.credits, "refund (create failed)", input.runId);
  if (billing.hold) await releasePlatformHold(billing.hold);
}

type Settleable = Pick<RunRow, "id" | "userId" | "cost" | "expected" | "providerRef">;

/**
 * Settle a run for what it made: `produced` of `expected` outputs are paid for
 * and the rest is given back. On the ledger that is a refund of the missing
 * part. On the platform it ends the hold, once: an ended hold is taken off the
 * run, so calling this again does nothing, and a hold Canopy could not be told
 * about stays on the run for `settlePendingHolds` to retry.
 */
export async function settleRun(run: Settleable, produced: number, refundReason: string): Promise<void> {
  const perOutput = run.expected > 0 ? run.cost / run.expected : run.cost;
  const made = Math.max(0, Math.min(produced, run.expected));
  const billing = (run.providerRef as { billing?: RunBilling } | null)?.billing;
  if (!billing) {
    const missing = Math.max(0, run.expected - made);
    if (missing > 0) await refundCredits(run.userId, Math.round(perOutput * missing), refundReason, run.id);
    return;
  }
  if (!billing.hold) return;
  const cents = Math.min(billing.hold.cents, creditsToCents(Math.round(perOutput * made)));
  const ended = cents > 0 ? await settlePlatformHold(billing.hold, cents) : await releasePlatformHold(billing.hold);
  if (!ended) return;
  await db()
    .update(runs)
    .set({ providerRef: sql`jsonb_set(${runs.providerRef} #- '{billing,hold}', '{billing,chargedCents}', to_jsonb(${cents}::int))` })
    .where(eq(runs.id, run.id));
}

/** Finished runs whose hold is still open (Canopy was out of reach when they ended): settle them now. */
export async function settlePendingHolds(limit = 25): Promise<number> {
  const d = db();
  const open = await d
    .select()
    .from(runs)
    .where(
      and(
        inArray(runs.status, ["succeeded", "failed"]),
        sql`${runs.providerRef} #> '{billing,hold}' IS NOT NULL`,
        // Not the run that is ending right now, and not history older than a week.
        lt(runs.finishedAt, new Date(Date.now() - 60_000)),
        gt(runs.finishedAt, new Date(Date.now() - 7 * 86_400_000)),
      ),
    )
    .limit(limit);
  for (const r of open) {
    const made = await d.select({ id: assets.id }).from(assets).where(and(eq(assets.runId, r.id), inArray(assets.kind, ["result"])));
    await settleRun(r, made.length, "refund");
  }
  return open.length;
}
