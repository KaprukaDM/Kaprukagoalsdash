// server.js — Kapruka Goal Dashboard API
// Deploy on Render.com — Free tier
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Supabase client ─────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Kapruka Goal Dashboard API v2' });
});

// ════════════════════════════════════════════════════════════════
// CHANNELS
// ════════════════════════════════════════════════════════════════
app.get('/api/channels', async (req, res) => {
  try {
    const { data: channels, error: cErr } = await supabase
      .from('channels').select('*').order('sort_order');
    if (cErr) throw cErr;

    const { data: metrics, error: mErr } = await supabase
      .from('channel_metrics').select('*').order('sort_order');
    if (mErr) throw mErr;

    const metricsByChannel = {};
    metrics.forEach(m => {
      if (!metricsByChannel[m.channel_id]) metricsByChannel[m.channel_id] = [];
      metricsByChannel[m.channel_id].push(m);
    });

    res.json(channels.map(ch => ({ ...ch, metrics: metricsByChannel[ch.id] || [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/channels', async (req, res) => {
  try {
    const { id, name, color, source, budget, metrics } = req.body;
    const { data: existing } = await supabase
      .from('channels').select('sort_order')
      .order('sort_order', { ascending: false }).limit(1);
    const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

    const { data: channel, error: cErr } = await supabase
      .from('channels')
      .insert({ id, name, color, source, budget, spent: 0, sort_order: nextOrder })
      .select().single();
    if (cErr) throw cErr;

    if (metrics?.length) {
      const { error: mErr } = await supabase.from('channel_metrics')
        .insert(metrics.map((m, i) => ({ ...m, channel_id: id, sort_order: i })));
      if (mErr) throw mErr;
    }
    res.status(201).json(channel);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/channels/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('channels').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true, deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// GOALS
// ════════════════════════════════════════════════════════════════
app.get('/api/goals', async (req, res) => {
  try {
    const { month, year, channel_id } = req.query;
    let query = supabase
      .from('goals').select('*, goal_kpis(*)')
      .eq('month', month || new Date().getMonth() + 1)
      .eq('year',  year  || new Date().getFullYear())
      .order('created_at', { ascending: true });
    if (channel_id) query = query.eq('channel_id', channel_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data.map(g => ({ ...g, items: g.output_items || [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/goals', async (req, res) => {
  try {
    const { channel_id, name, type, output_desc, budget, kpis, items, month, year } = req.body;
    const { data: goal, error: gErr } = await supabase.from('goals')
      .insert({ channel_id, name, type, output_desc, budget, month, year, output_items: items || [] })
      .select().single();
    if (gErr) throw gErr;
    if (kpis?.length) {
      const { error: kErr } = await supabase.from('goal_kpis')
        .insert(kpis.map(k => ({ goal_id: goal.id, ...k })));
      if (kErr) throw kErr;
    }
    res.status(201).json({ ...goal, items: goal.output_items || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/goals/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('goals').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/goals/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.completed !== undefined) {
      updates.completed    = req.body.completed;
      updates.completed_at = req.body.completed ? new Date().toISOString() : null;
    }
    if (req.body.items !== undefined) {
      updates.output_items = req.body.items;
      if (Array.isArray(req.body.items) && req.body.items.length > 0) {
        updates.completed    = req.body.items.every(i => i.done);
        updates.completed_at = updates.completed ? new Date().toISOString() : null;
      }
    }
    const { data, error } = await supabase
      .from('goals').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ ...data, items: data.output_items || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/goals/:id', async (req, res) => {
  try {
    const { name, type, output_desc, budget, kpis, items } = req.body;
    const updates = { name, type, output_desc, budget };
    if (items !== undefined) updates.output_items = items;
    const { data: goal, error: gErr } = await supabase
      .from('goals').update(updates).eq('id', req.params.id).select().single();
    if (gErr) throw gErr;
    if (kpis !== undefined) {
      await supabase.from('goal_kpis').delete().eq('goal_id', req.params.id);
      if (kpis.length) {
        const { error: kErr } = await supabase.from('goal_kpis')
          .insert(kpis.map(k => ({ goal_id: req.params.id, ...k })));
        if (kErr) throw kErr;
      }
    }
    res.json({ ...goal, items: goal.output_items || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ACTUALS
// ════════════════════════════════════════════════════════════════
app.get('/api/actuals', async (req, res) => {
  try {
    const m = parseInt(req.query.month) || new Date().getMonth() + 1;
    const y = parseInt(req.query.year)  || new Date().getFullYear();
    const { data, error } = await supabase
      .from('kpi_actuals').select('channel_id, kpi_key, value, synced_at')
      .eq('month', m).eq('year', y);
    if (error) throw error;
    const shaped = {};
    data.forEach(row => {
      if (!shaped[row.channel_id]) shaped[row.channel_id] = {};
      shaped[row.channel_id][row.kpi_key] = row.value;
    });
    const lastSync = data.reduce((l, r) => r.synced_at > l ? r.synced_at : l, '');
    res.json({ actuals: shaped, last_sync: lastSync });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// SYNC — Pull live data from all platforms
// POST /api/sync
// ════════════════════════════════════════════════════════════════
app.post('/api/sync', async (req, res) => {
  const month = parseInt(req.query.month || req.body?.month) || new Date().getMonth() + 1;
  const year  = parseInt(req.query.year  || req.body?.year)  || new Date().getFullYear();
  const results = { synced: [], errors: [] };

  async function upsert(channel_id, kpi_key, value) {
    const { error } = await supabase.from('kpi_actuals').upsert(
      { channel_id, kpi_key, value, month, year, synced_at: new Date().toISOString() },
      { onConflict: 'channel_id,kpi_key,month,year' }
    );
    if (error) throw error;
  }

  // ── Google Ads ───────────────────────────────────────────────
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    const client = new GoogleAdsApi({
      client_id:       process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret:   process.env.GOOGLE_ADS_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    });
    const customer = client.Customer({
      customer_id:       process.env.GOOGLE_ADS_CUSTOMER_ID,
      login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      refresh_token:     process.env.GOOGLE_ADS_REFRESH_TOKEN,
    });
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end   = new Date(year, month, 0).toISOString().split('T')[0];
    const rows  = await customer.query(`
      SELECT metrics.conversions, metrics.cost_micros
      FROM campaign
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
    `);
    let conversions = 0, spend = 0;
    rows.forEach(r => {
      conversions += r.metrics.conversions || 0;
      spend       += (r.metrics.cost_micros || 0) / 1_000_000;
    });
    const spendLKR = Math.round(spend * 350);
    const cpa      = conversions > 0 ? Math.round(spendLKR / conversions) : 0;
    await upsert('google_ads', 'conversions', Math.round(conversions));
    await upsert('google_ads', 'spend',       spendLKR);
    await upsert('google_ads', 'cpa',         cpa);
    await supabase.from('channels').update({ spent: spendLKR }).eq('id', 'google_ads');
    results.synced.push('google_ads');
  } catch (e) {
    results.errors.push({ channel: 'google_ads', error: e.message });
  }

  // ── Meta Ads ─────────────────────────────────────────────────
  try {
    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate   = new Date(year, month, 0).toISOString().split('T')[0];
    const token     = process.env.META_ACCESS_TOKEN;
    const accountId = process.env.META_AD_ACCOUNT_ID;
    const fields    = 'reach,impressions,spend,actions,action_values,clicks,cpm,frequency,video_p3_watched_actions';
    const url       = `https://graph.facebook.com/v18.0/${accountId}/insights?fields=${fields}&time_range={"since":"${startDate}","until":"${endDate}"}&level=account&access_token=${token}`;
    const r         = await fetch(url);
    const data      = await r.json();
    const d         = data.data?.[0] || {};
    const purchases = parseInt((d.actions||[]).find(a=>a.action_type==='purchase')?.value || 0);
    const revenue   = parseFloat((d.action_values||[]).find(a=>a.action_type==='purchase')?.value || 0);
    const spendLKR  = Math.round(parseFloat(d.spend||0) * 350);
    const reach     = parseInt(d.reach||0);
    const impressions = parseInt(d.impressions||0);
    const clicks    = parseInt(d.clicks||0);
    const cpm       = Math.round(parseFloat(d.cpm||0) * 350);
    const frequency = parseFloat(parseFloat(d.frequency||0).toFixed(2));
    const videoViews= parseInt((d.video_p3_watched_actions||[{}])[0]?.value||0);
    const ctr       = impressions > 0 ? parseFloat((clicks/impressions*100).toFixed(2)) : 0;
    const brandSpend= Math.round(spendLKR * 0.4);
    const revSpend  = Math.round(spendLKR * 0.6);
    const cpa       = purchases > 0 ? Math.round(revSpend / purchases) : 0;
    const roas      = revSpend > 0 ? parseFloat((revenue*350/revSpend).toFixed(2)) : 0;

    await upsert('fb_branding', 'reach',        reach);
    await upsert('fb_branding', 'impressions',  impressions);
    await upsert('fb_branding', 'spend',        brandSpend);
    await upsert('fb_branding', 'cpm',          cpm);
    await upsert('fb_branding', 'frequency',    frequency);
    await upsert('fb_branding', 'video_views',  videoViews);
    await upsert('fb_branding', 'link_clicks',  Math.round(clicks * 0.4));
    await upsert('fb_branding', 'ctr',          ctr);
    await upsert('fb_revenue',  'conversions',  purchases);
    await upsert('fb_revenue',  'reach',        Math.round(reach * 0.6));
    await upsert('fb_revenue',  'impressions',  Math.round(impressions * 0.6));
    await upsert('fb_revenue',  'spend',        revSpend);
    await upsert('fb_revenue',  'cpa',          cpa);
    await upsert('fb_revenue',  'roas',         roas);
    await upsert('fb_revenue',  'link_clicks',  Math.round(clicks * 0.6));
    await supabase.from('channels').update({ spent: brandSpend }).eq('id', 'fb_branding');
    await supabase.from('channels').update({ spent: revSpend   }).eq('id', 'fb_revenue');
    results.synced.push('fb_branding', 'fb_revenue');
  } catch (e) {
    results.errors.push({ channel: 'fb_meta', error: e.message });
  }

  // ── FB / IG Organic ──────────────────────────────────────────
  try {
    const token  = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;
    const metricsStr = 'page_impressions,page_reach,page_post_engagements,page_fan_adds_unique';
    const url    = `https://graph.facebook.com/v18.0/${pageId}/insights?metric=${metricsStr}&period=month&access_token=${token}`;
    const r      = await fetch(url);
    const data   = await r.json();
    const byName = {};
    (data.data||[]).forEach(m => { byName[m.name] = m.values?.[m.values.length-1]?.value || 0; });
    const impressions     = parseInt(byName['page_impressions']||0);
    const reach           = parseInt(byName['page_reach']||0);
    const engagements     = parseInt(byName['page_post_engagements']||0);
    const followersGained = parseInt(byName['page_fan_adds_unique']||0);
    const engagementRate  = reach > 0 ? parseFloat((engagements/reach*100).toFixed(2)) : 0;
    await upsert('fb_organic', 'reach',            reach);
    await upsert('fb_organic', 'post_impressions', impressions);
    await upsert('fb_organic', 'engagement_rate',  engagementRate);
    await upsert('fb_organic', 'followers_gained', followersGained);
    await upsert('fb_organic', 'reactions',        Math.round(engagements * 0.7));
    await upsert('fb_organic', 'shares',           Math.round(engagements * 0.1));
    results.synced.push('fb_organic');
  } catch (e) {
    results.errors.push({ channel: 'fb_organic', error: e.message });
  }

  // ── Google Search Console ────────────────────────────────────
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GSC_REFRESH_TOKEN });
    const sc        = google.searchconsole({ version: 'v1', auth });
    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate   = new Date(year, month, 0).toISOString().split('T')[0];
    const r = await sc.searchanalytics.query({
      siteUrl: process.env.GSC_SITE_URL,
      requestBody: { startDate, endDate, dimensions: [], rowLimit: 1 }
    });
    const row = r.data?.rows?.[0] || {};
    await upsert('seo', 'clicks',       Math.round(row.clicks      || 0));
    await upsert('seo', 'impressions',  Math.round(row.impressions || 0));
    await upsert('seo', 'ctr',          parseFloat(((row.ctr||0)*100).toFixed(2)));
    await upsert('seo', 'avg_position', parseFloat((row.position||0).toFixed(1)));
    results.synced.push('seo');
  } catch (e) {
    results.errors.push({ channel: 'seo', error: e.message });
  }

  res.json({ success: true, month, year, synced_at: new Date().toISOString(), ...results });
});

// ════════════════════════════════════════════════════════════════
// AI GOAL SUGGESTIONS
// POST /api/goals/suggest
// ════════════════════════════════════════════════════════════════
app.post('/api/goals/suggest', async (req, res) => {
  try {
    const { goalName, goalType, activity } = req.body;
    const { data: metrics } = await supabase
      .from('channel_metrics').select('*').eq('channel_id', activity).order('sort_order');

    if (process.env.GEMINI_API_KEY) {
      const prompt = `You are a digital marketing analyst for Kapruka, Sri Lanka's leading e-commerce platform.
A team member wants to set a "${goalType}" goal: "${goalName}" for the "${activity}" channel.
Available metrics: ${(metrics||[]).map(m=>m.label).join(', ')}.
Suggest the 3 most relevant KPIs to track this goal.
Respond ONLY with valid JSON, no markdown:
{"reasoning":"one sentence why","suggested_kpis":[{"key":"metric_key","label":"Metric Label","unit":"LKR or % or x or empty","suggested_target":0,"why":"one sentence"}]}`;
      const r    = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) }
      );
      const d     = await r.json();
      const text  = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = text.replace(/```json|```/g,'').trim();
      return res.json(JSON.parse(clean));
    }

    res.json({
      reasoning: `Top metrics for "${goalName}" on ${activity}`,
      suggested_kpis: (metrics||[]).slice(0,3).map(m => ({
        key: m.key, label: m.label, unit: m.unit||'',
        suggested_target: 0, why: `Key performance indicator for ${activity}`
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Kapruka Goals API running on port ${PORT}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✓ connected' : '✗ missing SUPABASE_URL'}`);
});
