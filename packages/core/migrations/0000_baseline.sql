CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"run_id" text,
	"parent_id" text,
	"kind" text NOT NULL,
	"media" text DEFAULT 'image' NOT NULL,
	"storage_key" text NOT NULL,
	"preview_key" text,
	"poster_key" text,
	"meta" jsonb,
	"mime" text NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"segments" jsonb,
	"share_token" text,
	"marked" boolean DEFAULT false NOT NULL,
	"saved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE "credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "project_members" (
	"project_id" text NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"role" text DEFAULT 'editor' NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_email_pk" PRIMARY KEY("project_id","email")
);

CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"studio" text DEFAULT 'fashion' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "review_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"author" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"verdict" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tool" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"expected" integer DEFAULT 1 NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);

CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"image_url" text,
	"credits" integer DEFAULT 200 NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "assets_project_idx" ON "assets" USING btree ("project_id","created_at");
CREATE INDEX "assets_run_idx" ON "assets" USING btree ("run_id");
CREATE INDEX "assets_share_idx" ON "assets" USING btree ("share_token");
CREATE INDEX "ledger_user_idx" ON "credit_ledger" USING btree ("user_id","created_at");
CREATE INDEX "members_user_idx" ON "project_members" USING btree ("user_id");
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id","last_opened_at");
CREATE INDEX "review_asset_idx" ON "review_comments" USING btree ("asset_id","created_at");
CREATE INDEX "runs_project_idx" ON "runs" USING btree ("project_id","created_at");
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status","created_at");
