-- ================================================================
-- KAPRUKA GOAL DASHBOARD — SUPABASE SCHEMA v2
-- Run this in: Supabase → SQL Editor → New Query → Run
-- ================================================================

-- ── 1. CHANNELS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  source      TEXT NOT NULL DEFAULT 'API',
  budget      NUMERIC NOT NULL DEFAULT 0,
  spent       NUMERIC NOT NULL DEFAULT 0,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. CHANNEL METRICS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_metrics (
  id           SERIAL PRIMARY KEY,
  channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  unit         TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  lower_better BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INT NOT NULL DEFAULT 0,
  UNIQUE(channel_id, key)
);

-- ── 3. GOALS ─────────────────────────────────────────────────────
-- NOTE: output_items stores the per-checkbox items as JSONB
-- Format: [{ id, label, done, note }]
CREATE TABLE IF NOT EXISTS goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('outcome', 'output')),
  output_desc  TEXT,
  output_items JSONB NOT NULL DEFAULT '[]',  -- ← checklist items
  budget       NUMERIC,
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  month        INT NOT NULL,
  year         INT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. GOAL KPIs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goal_kpis (
  id           SERIAL PRIMARY KEY,
  goal_id      UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  unit         TEXT NOT NULL DEFAULT '',
  lower_better BOOLEAN NOT NULL DEFAULT FALSE,
  target       NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(goal_id, key)
);

-- ── 5. KPI ACTUALS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_actuals (
  id          SERIAL PRIMARY KEY,
  channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  kpi_key     TEXT NOT NULL,
  value       NUMERIC,
  month       INT NOT NULL,
  year        INT NOT NULL,
  synced_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, kpi_key, month, year)
);

-- ── 6. BUDGET HISTORY ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_history (
  id          SERIAL PRIMARY KEY,
  channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  budget      NUMERIC NOT NULL,
  spent       NUMERIC NOT NULL DEFAULT 0,
  month       INT NOT NULL,
  year        INT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, month, year)
);

-- ── INDEXES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_goals_channel_month ON goals(channel_id, month, year);
CREATE INDEX IF NOT EXISTS idx_goal_kpis_goal      ON goal_kpis(goal_id);
CREATE INDEX IF NOT EXISTS idx_kpi_actuals_lookup  ON kpi_actuals(channel_id, month, year);
CREATE INDEX IF NOT EXISTS idx_budget_lookup       ON budget_history(channel_id, month, year);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────
-- Service role key (used by Vercel) bypasses RLS.
-- This prevents direct browser access to your data.
ALTER TABLE channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_kpis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_actuals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_history  ENABLE ROW LEVEL SECURITY;

-- ── UPDATED_AT TRIGGER ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS goals_updated_at ON goals;
CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── SEED DEFAULT CHANNELS ────────────────────────────────────────
INSERT INTO channels (id, name, color, source, budget, spent, sort_order) VALUES
  ('google_ads',   'Google Ads',      '#4f8ef7', 'Google Ads API',        400000, 320000, 1),
  ('fb_branding',  'FB Branding',     '#a855f7', 'Meta Ads API',          200000, 140000, 2),
  ('fb_revenue',   'FB Revenue',      '#3b82f6', 'Meta Ads API',          350000, 280000, 3),
  ('fb_organic',   'FB / IG Organic', '#ec4899', 'Meta Page Insights',     50000,  31000, 4),
  ('seo',          'SEO',             '#34d399', 'Search Console API',     80000,  62000, 5),
  ('factory',      'Factory Pages',   '#fb923c', 'Google Sheets',          60000,  48000, 6)
ON CONFLICT (id) DO NOTHING;

-- ── SEED METRICS ─────────────────────────────────────────────────
INSERT INTO channel_metrics (channel_id, key, label, unit, description, lower_better, sort_order) VALUES
  ('google_ads', 'conversions', 'Conversions',  '',    'Total conversion actions',      false, 1),
  ('google_ads', 'cpa',         'CPA',          'LKR', 'Cost per acquisition',          true,  2),
  ('google_ads', 'spend',       'Amount Spend', 'LKR', 'Total ad spend this period',    false, 3),
  ('fb_branding','reach',        'Reach',        '',    'Unique accounts reached',       false, 1),
  ('fb_branding','impressions',  'Impressions',  '',    'Total ad impressions',          false, 2),
  ('fb_branding','frequency',    'Frequency',    '',    'Avg times each person saw ad',  false, 3),
  ('fb_branding','cpm',          'CPM',          'LKR', 'Cost per 1000 impressions',    true,  4),
  ('fb_branding','spend',        'Amount Spend', 'LKR', 'Total branding spend',         false, 5),
  ('fb_branding','video_views',  'Video Views',  '',    '3-second video views',          false, 6),
  ('fb_branding','link_clicks',  'Link Clicks',  '',    'Clicks to site from ads',       false, 7),
  ('fb_branding','ctr',          'CTR',          '%',   'Click-through rate',            false, 8),
  ('fb_revenue', 'conversions',  'Conversions',  '',    'Purchase or lead events',       false, 1),
  ('fb_revenue', 'reach',        'Reach',        '',    'Unique accounts reached',       false, 2),
  ('fb_revenue', 'impressions',  'Impressions',  '',    'Total ad impressions',          false, 3),
  ('fb_revenue', 'cpa',          'CPA',          'LKR', 'Cost per acquisition',         true,  4),
  ('fb_revenue', 'roas',         'ROAS',         'x',   'Return on ad spend',            false, 5),
  ('fb_revenue', 'spend',        'Amount Spend', 'LKR', 'Total revenue campaign spend',  false, 6),
  ('fb_revenue', 'link_clicks',  'Link Clicks',  '',    'Clicks driving to site',        false, 7),
  ('fb_organic', 'reach',            'Reach',            '',  'Organic post reach',          false, 1),
  ('fb_organic', 'engagement_rate',  'Engagement Rate',  '%', 'Eng / reach %',               false, 2),
  ('fb_organic', 'followers_gained', 'Followers Gained', '',  'Net new followers',           false, 3),
  ('fb_organic', 'post_impressions', 'Post Impressions', '',  'Total post impressions',      false, 4),
  ('fb_organic', 'reactions',        'Reactions',        '',  'Likes, loves, etc.',          false, 5),
  ('fb_organic', 'shares',           'Shares',           '',  'Post shares',                 false, 6),
  ('seo', 'clicks',       'Clicks',       '',  'Organic search clicks (GSC)', false, 1),
  ('seo', 'impressions',  'Impressions',  '',  'Search impressions (GSC)',    false, 2),
  ('seo', 'avg_position', 'Avg. Position','',  'Average ranking position',   true,  3),
  ('seo', 'ctr',          'CTR',          '%', 'Click-through rate from GSC', false, 4),
  ('factory', 'orders',           'Orders',           '',    'Total orders from factory pages', false, 1),
  ('factory', 'cpa',              'CPA',              'LKR', 'Cost per acquisition',           true,  2),
  ('factory', 'cost_per_order',   'Cost per Order',   'LKR', 'Total cost / total orders',      true,  3),
  ('factory', 'conversion_rate',  'Conversion Rate',  '%',   'Sessions to order %',             false, 4)
ON CONFLICT (channel_id, key) DO NOTHING;

-- ── IF UPGRADING FROM v1 (add output_items column if missing) ────
-- Run this only if you already have the goals table without output_items:
-- ALTER TABLE goals ADD COLUMN IF NOT EXISTS output_items JSONB NOT NULL DEFAULT '[]';
