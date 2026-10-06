-- Review boards, Explore gallery, dashboard folders, project preferences; 20 free credits.
-- Additive and idempotent: safe to run on a live database.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS folder_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS preferences jsonb;
ALTER TABLE users ALTER COLUMN credits SET DEFAULT 20;

CREATE TABLE IF NOT EXISTS folders (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folders_owner_idx ON folders (owner_id);

CREATE TABLE IF NOT EXISTS review_boards (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  project_id text NOT NULL,
  created_by text NOT NULL,
  title text NOT NULL DEFAULT '',
  asset_ids jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS review_boards_project_idx ON review_boards (project_id, created_at);

CREATE TABLE IF NOT EXISTS explore_posts (
  id text PRIMARY KEY,
  asset_id text NOT NULL UNIQUE,
  user_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden_at timestamptz
);
CREATE INDEX IF NOT EXISTS explore_recent_idx ON explore_posts (created_at);
