-- Exact masters + preview renditions + asset metadata (sha256, fidelity, model).
-- Additive and idempotent: safe to run on a live database.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS preview_key text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS meta jsonb;
