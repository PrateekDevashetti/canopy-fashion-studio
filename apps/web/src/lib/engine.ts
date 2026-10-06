import "server-only";
import { processRun } from "@fashion/core";
import { after } from "next/server";

/** Inline engine (local dev, or production without a worker): run after the response is sent. */
export function dispatch(runId: string) {
  if (process.env.FASHION_ENGINE_MODE === "worker") return;
  after(() => processRun(runId).catch((e) => console.error(`[engine] ${runId}`, e)));
}

/** Fallback for runs the worker never picked up. `processRun` claims atomically, so racing the worker is safe. */
export async function kickStale(ids: string[]) {
  await Promise.all(ids.map((id) => processRun(id).catch((e) => console.error(`[engine] kick ${id}`, e))));
}
