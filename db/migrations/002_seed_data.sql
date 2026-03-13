-- ============================================================
-- db/migrations/002_seed_data.sql
--
-- QAPi seed data
-- Creates demo API keys for each subscription tier so the
-- service works out of the box for local development.
-- ============================================================

-- Demo users (match the hard-coded keys in api/src/data/keyStore.js)
INSERT INTO users (email, tier, api_key, stripe_customer_id)
VALUES
  ('demo@starter.dev', 'starter', 'qapi-starter-demo-key', NULL),
  ('demo@pro.dev',     'pro',     'qapi-pro-demo-key',     'cus_demo_pro'),
  ('demo@audited.dev', 'audited', 'qapi-audited-demo-key', 'cus_demo_audited')
ON CONFLICT (email) DO NOTHING;

-- Seed a handful of public module records
INSERT INTO modules (name, owner, repo, sha, file_path, tier, description)
VALUES
  (
    'express',
    'expressjs', 'express',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'index.js',
    'starter',
    'Fast, unopinionated, minimalist web framework for Node.js'
  ),
  (
    'lodash',
    'lodash', 'lodash',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'lodash.js',
    'starter',
    'A modern JavaScript utility library delivering modularity, performance, and extras'
  ),
  (
    'private-utils',
    'myorg', 'private-utils',
    'cccccccccccccccccccccccccccccccccccccccc',
    'src/index.js',
    'pro',
    'Private organisation utilities (Pro+ required)'
  )
ON CONFLICT (owner, repo, sha, file_path) DO NOTHING;
