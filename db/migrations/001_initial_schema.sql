-- ============================================================
-- db/migrations/001_initial_schema.sql
--
-- QAPi initial database schema
--
-- Tables:
--   users            – subscriber accounts
--   api_timeline     – Claude AI timeline entries
--   build_jobs       – SDK parallel build job records
--   modules          – virtual module node registry
--   usage_metrics    – per-key API usage counters
--   audit_logs       – immutable security audit trail
--   webhooks         – outbound webhook registrations
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- for gen_random_uuid()

-- ── Enumerations ─────────────────────────────────────────────────────────────

CREATE TYPE subscription_tier AS ENUM ('starter', 'pro', 'audited');
CREATE TYPE build_status AS ENUM ('queued', 'running', 'success', 'failed', 'cancelled');
CREATE TYPE build_platform AS ENUM ('apk', 'ios', 'exe', 'web', 'pwa');
CREATE TYPE audit_outcome AS ENUM ('allow', 'deny');
CREATE TYPE webhook_event AS ENUM (
  'module.resolved',
  'build.completed',
  'build.failed',
  'key.rotated',
  'tier.changed'
);

-- ── users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  tier          subscription_tier NOT NULL DEFAULT 'starter',
  api_key       TEXT        NOT NULL UNIQUE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  stripe_customer_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_api_key ON users (api_key);
CREATE INDEX IF NOT EXISTS idx_users_tier    ON users (tier);

-- ── api_timeline ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_timeline (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES users (id) ON DELETE SET NULL,
  tier            subscription_tier NOT NULL,
  model           TEXT        NOT NULL,
  prompt          TEXT        NOT NULL,
  response        TEXT        NOT NULL,
  input_tokens    INTEGER     NOT NULL DEFAULT 0,
  output_tokens   INTEGER     NOT NULL DEFAULT 0,
  total_tokens    INTEGER     NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(12, 8) NOT NULL DEFAULT 0,
  latency_ms      INTEGER     NOT NULL DEFAULT 0,
  cached          BOOLEAN     NOT NULL DEFAULT FALSE,
  request_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_user_id   ON api_timeline (user_id);
CREATE INDEX IF NOT EXISTS idx_timeline_created   ON api_timeline (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_tier      ON api_timeline (tier);

-- ── build_jobs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS build_jobs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          REFERENCES users (id) ON DELETE SET NULL,
  tier            subscription_tier NOT NULL,
  platform        build_platform    NOT NULL,
  sdk_version     TEXT          NOT NULL,
  source_path     TEXT          NOT NULL,
  status          build_status  NOT NULL DEFAULT 'queued',
  priority        SMALLINT      NOT NULL DEFAULT 1,
  artifact_url    TEXT,
  error           TEXT,
  logs            TEXT          NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_build_jobs_user_id ON build_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_build_jobs_status  ON build_jobs (status);
CREATE INDEX IF NOT EXISTS idx_build_jobs_created ON build_jobs (created_at DESC);

-- ── modules ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS modules (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  owner         TEXT        NOT NULL,
  repo          TEXT        NOT NULL,
  sha           CHAR(40)    NOT NULL,
  file_path     TEXT        NOT NULL,
  tier          subscription_tier NOT NULL DEFAULT 'starter',
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner, repo, sha, file_path)
);

CREATE INDEX IF NOT EXISTS idx_modules_name ON modules (name);
CREATE INDEX IF NOT EXISTS idx_modules_sha  ON modules (sha);
CREATE INDEX IF NOT EXISTS idx_modules_tier ON modules (tier);

-- ── usage_metrics ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage_metrics (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES users (id) ON DELETE CASCADE,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  resolve_calls INTEGER     NOT NULL DEFAULT 0,
  build_calls   INTEGER     NOT NULL DEFAULT 0,
  claude_calls  INTEGER     NOT NULL DEFAULT 0,
  total_tokens  BIGINT      NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  cache_hits    INTEGER     NOT NULL DEFAULT 0,
  error_count   INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (user_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_period ON usage_metrics (user_id, period_start DESC);

-- ── audit_logs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          REFERENCES users (id) ON DELETE SET NULL,
  actor       TEXT          NOT NULL,
  action      TEXT          NOT NULL,
  resource    TEXT          NOT NULL,
  outcome     audit_outcome NOT NULL DEFAULT 'allow',
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id  ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_outcome  ON audit_logs (outcome);

-- ── webhooks ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhooks (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  url         TEXT          NOT NULL,
  events      webhook_event[] NOT NULL DEFAULT '{}',
  secret      TEXT          NOT NULL,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks (user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active  ON webhooks (is_active) WHERE is_active = TRUE;

-- ── Trigger: auto-update updated_at ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER modules_updated_at
  BEFORE UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
