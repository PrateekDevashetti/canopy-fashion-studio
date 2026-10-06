-- Exact masters + preview renditions + asset metadata (sha256, fidelity, colorDelta, model),
-- and shared rate limits. Additive and idempotent: safe to run on a live database.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS preview_key text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS meta jsonb;

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0
);
