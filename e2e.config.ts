import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { openrouter } from "@openrouter/ai-sdk-provider";

/**
 * End-to-end pressure test (tester-army/e2e — same harness as OnBrand API).
 *
 *   E2E_BASE_URL       app under test (default: local dev on :3200, dev auth)
 *   E2E_COOKIE         session cookie for a deployed env (Clerk __session=…), optional
 *   E2E_REAL_MODELS=1  run the paid real-model generation tests
 *   OPENROUTER_API_KEY enables the natural-language agent (UI judgment) steps
 */
const url = process.env.E2E_BASE_URL ?? "http://localhost:3200";

export default {
  agents: process.env.OPENROUTER_API_KEY ? { default: { model: openrouter("anthropic/claude-haiku-4.5") } } : undefined,
  targets: [{ engine: web({ viewport: { width: 1600, height: 900 } }), app: { url } }],
  tests: "tests/e2e/**/*.e2e.ts",
  timeout: 300_000,
  workers: 2,
} satisfies E2EConfig;
