// server.js — Kapruka Goal Dashboard API v3 (Clean Rebuild)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['https://kaprukadm.github.io', 'http://localhost:3000', 'http://localhost:5500'],
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── Helpers ─────────────────────────────────────────────
function dateRange(year, month) {
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end   = new Date(year, month, 0).toISOString().split('T')[0];
  return { start, end };
}

async function upsertActual(channel_id, kpi_key, value, month, year) {
  const { error } = await supabase.from('kpi_actuals').upsert(
    { channel_id, kpi_key, value, month, year, synced_at: new Date().toISOString() },
    { onConflict: 'channel_id,kpi_key,month,year' }
  );
  if (error) throw error;
}

// ════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Kapruka Dashboard v3' }));

// ════════════════════════════════════════════════════
// CHANNELS
// ════════════════════════════════════════════════════
app.get('/api/channels', async (req, res) => {
  try {
    const { data, error } = await supabase.from('channels').select('*').order('sort_order');
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════
// GOALS
// ════════════════════════════════════════════════════
app.get('/api/goals', async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const { data, error } = await supabase
      .from('goals').select('*, goal_kpis(*)')
      .eq('month', month).eq('year', year)
      .order('created_at');
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/goals', async (req, res) => {
  try {
    const { channel_id, name, month, year, kpis } = req.body;
    if (!channel_id) return res.status(400).json({ error: 'channel_id required' });
    const { data: goal, error } = await supabase.from('goals')
      .insert({ channel_id, name, month, year }).select().single();
    if (error) throw error;
    if (kpis?.length) {
      const { error: ke } = await supabase.from('goal_kpis')
        .insert(kpis.map(k => ({ goal_id: goal.id, ...k })));
      if (ke) throw ke;
    }
    res.status(201).json(goal);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/goals/:id', async (req, res) => {
  try {
    await supabase.from('goal_kpis').delete().eq('goal_id', req.params.id);
    await supabase.from('goals').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════
// ACTUALS
// ════════════════════════════════════════════════════
app.get('/api/actuals', async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const { data, error } = await supabase
      .from('kpi_actuals').select('channel_id, kpi_key, value, synced_at')
      .eq('month', month).eq('year', year);
    if (error) throw error;
    const shaped = {};
    data.forEach(r => {
      if (!shaped[r.channel_id]) shaped[r.channel_id] = {};
      shaped[r.channel_id][r.kpi_key] = r.value;
    });
    const last_sync = data.reduce((l, r) => r.synced_at > l ? r.synced_at : l, '');
    res.json({ actuals: shaped, last_sync });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════
// AVAILABLE METRICS per channel (for goal builder dropdown)
// ════════════════════════════════════════════════════
app.get('/api/metrics/:channel_id', async (req, res) => {
  const { channel_id } = req.params;
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year  = parseInt(req.query.year)  || new Date().getFullYear();

  const STATIC_METRICS = {
    google_ads:  [
      { key: 'spend',       label: 'Spend',       unit: 'USD' },
      { key: 'conversions', label: 'Conversions',  unit: ''    },
      { key: 'cpa',         label: 'CPA',          unit: 'USD' },
      { key: 'clicks',      label: 'Clicks',       unit: ''    },
      { key: 'impressions', label: 'Impressions',  unit: ''    },
      { key: 'ctr',         label: 'CTR',          unit: '%'   },
    ],
    fb_branding: [
      { key: 'spend',       label: 'Spend',        unit: 'USD' },
      { key: 'reach',       label: 'Reach',        unit: ''    },
      { key: 'impressions', label: 'Impressions',  unit: ''    },
      { key: 'cpm',         label: 'CPM',          unit: 'USD' },
      { key: 'frequency',   label: 'Frequency',    unit: ''    },
      { key: 'video_views', label: 'Video Views',  unit: ''    },
      { key: 'link_clicks', label: 'Link Clicks',  unit: ''    },
      { key: 'ctr',         label: 'CTR',          unit: '%'   },
    ],
    fb_revenue: [
      { key: 'spend',       label: 'Spend',        unit: 'USD' },
      { key: 'conversions', label: 'Conversions',  unit: ''    },
      { key: 'cpa',         label: 'CPA',          unit: 'USD' },
      { key: 'roas',        label: 'ROAS',         unit: 'x'   },
      { key: 'reach',       label: 'Reach',        unit: ''    },
      { key: 'link_clicks', label: 'Link Clicks',  unit: ''    },
    ],
    fb_organic: [
      { key: 'reach',            label: 'Reach',            unit: ''  },
      { key: 'impressions',      label: 'Impressions',      unit: ''  },
      { key: 'engagement_rate',  label: 'Engagement Rate',  unit: '%' },
      { key: 'followers_gained', label: 'Followers Gained', unit: ''  },
      { key: 'reactions',        label: 'Reactions',        unit: ''  },
      { key: 'shares',           label: 'Shares',           unit: ''  },
    ],
    seo: [
      { key: 'clicks',       label: 'Clicks',        unit: ''  },
      { key: 'impressions',  label: 'Impressions',   unit: ''  },
      { key: 'avg_position', label: 'Avg. Position', unit: ''  },
      { key: 'ctr',          label: 'CTR',           unit: '%' },
    ],
  };

  if (channel_id === 'factory') {
    // Fetch column names from Google Sheets row 1
    try {
      const sheetId  = process.env.FACTORY_SHEET_ID;
      const tabName  = process.env.FACTORY_TAB_NAME || 'Sheet1';
      const apiKey   = process.env.GOOGLE_SHEETS_API_KEY;
      const range    = encodeURIComponent(`${tabName}!1:1`);
      const url      = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
      const r        = await fetch(url);
      const d        = await r.json();
      const headers  = (d.values?.[0] || []).filter(Boolean);
      return res.json(headers.map(h => ({ key: h.toLowerCase().replace(/\s+/g,'_'), label: h, unit: '' })));
    } catch (e) {
      return res.status(500).json({ error: 'Could not fetch Factory sheet headers: ' + e.message });
    }
  }

  res.json(STATIC_METRICS[channel_id] || []);
});

// ════════════════════════════════════════════════════
// SYNC — pull live data for selected metrics
// POST /api/sync?month=3&year=2026
// ════════════════════════════════════════════════════
app.post('/api/sync', async (req, res) => {
  const month = parseInt(req.query.month || req.body?.month) || new Date().getMonth() + 1;
  const year  = parseInt(req.query.year  || req.body?.year)  || new Date().getFullYear();
  const { start, end } = dateRange(year, month);
  const results = { synced: [], errors: [] };

  // ── Google Ads ──────────────────────────────────
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
    const rows = await customer.query(`
      SELECT metrics.conversions, metrics.cost_micros, metrics.clicks,
             metrics.impressions, metrics.ctr
      FROM campaign
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
    `);
    let conversions=0, costMicros=0, clicks=0, impressions=0;
    rows.forEach(r => {
      conversions  += r.metrics.conversions  || 0;
      costMicros   += r.metrics.cost_micros  || 0;
      clicks       += r.metrics.clicks       || 0;
      impressions  += r.metrics.impressions  || 0;
    });
    const spend = parseFloat((costMicros / 1_000_000).toFixed(2));
    const cpa   = conversions > 0 ? parseFloat((spend / conversions).toFixed(2)) : 0;
    const ctr   = impressions > 0 ? parseFloat((clicks / impressions * 100).toFixed(2)) : 0;

    await upsertActual('google_ads','spend',       spend,                    month, year);
    await upsertActual('google_ads','conversions', Math.round(conversions),  month, year);
    await upsertActual('google_ads','cpa',         cpa,                      month, year);
    await upsertActual('google_ads','clicks',      Math.round(clicks),       month, year);
    await upsertActual('google_ads','impressions', Math.round(impressions),  month, year);
    await upsertActual('google_ads','ctr',         ctr,                      month, year);
    await supabase.from('channels').update({ spent: spend }).eq('id','google_ads');
    results.synced.push('google_ads');
  } catch(e) { results.errors.push({ channel:'google_ads', error: e.message }); }

  // ── Meta Ads (Branding + Revenue) ───────────────
  try {
    const token     = process.env.META_ACCESS_TOKEN;
    const accountId = process.env.META_AD_ACCOUNT_ID;
    const fields    = 'reach,impressions,spend,actions,action_values,clicks,cpm,frequency,video_p3_watched_actions';
    const url       = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=${fields}&time_range={"since":"${start}","until":"${end}"}&level=account&access_token=${token}`;
    const r         = await fetch(url);
    const data      = await r.json();
    if (data.error) throw new Error(data.error.message);
    const d = data.data?.[0] || {};

    const purchases    = parseInt((d.actions||[]).find(a=>a.action_type==='purchase')?.value||0);
    const revenueUSD   = parseFloat((d.action_values||[]).find(a=>a.action_type==='purchase')?.value||0);
    const totalSpend   = parseFloat(parseFloat(d.spend||0).toFixed(2));
    const reach        = parseInt(d.reach||0);
    const impressions  = parseInt(d.impressions||0);
    const clicks       = parseInt(d.clicks||0);
    const cpm          = parseFloat(parseFloat(d.cpm||0).toFixed(2));
    const frequency    = parseFloat(parseFloat(d.frequency||0).toFixed(2));
    const videoViews   = parseInt((d.video_p3_watched_actions||[{}])[0]?.value||0);
    const ctr          = impressions>0 ? parseFloat((clicks/impressions*100).toFixed(2)) : 0;
    const brandSpend   = parseFloat((totalSpend*0.4).toFixed(2));
    const revSpend     = parseFloat((totalSpend*0.6).toFixed(2));
    const cpa          = purchases>0 ? parseFloat((revSpend/purchases).toFixed(2)) : 0;
    const roas         = revSpend>0  ? parseFloat((revenueUSD/revSpend).toFixed(2)) : 0;

    await upsertActual('fb_branding','spend',       brandSpend,             month,year);
    await upsertActual('fb_branding','reach',        reach,                  month,year);
    await upsertActual('fb_branding','impressions',  impressions,            month,year);
    await upsertActual('fb_branding','cpm',          cpm,                    month,year);
    await upsertActual('fb_branding','frequency',    frequency,              month,year);
    await upsertActual('fb_branding','video_views',  videoViews,             month,year);
    await upsertActual('fb_branding','link_clicks',  Math.round(clicks*0.4), month,year);
    await upsertActual('fb_branding','ctr',          ctr,                    month,year);

    await upsertActual('fb_revenue','spend',       revSpend,               month,year);
    await upsertActual('fb_revenue','conversions', purchases,              month,year);
    await upsertActual('fb_revenue','cpa',         cpa,                    month,year);
    await upsertActual('fb_revenue','roas',        roas,                   month,year);
    await upsertActual('fb_revenue','reach',       Math.round(reach*0.6),  month,year);
    await upsertActual('fb_revenue','link_clicks', Math.round(clicks*0.6), month,year);

    await supabase.from('channels').update({ spent: brandSpend }).eq('id','fb_branding');
    await supabase.from('channels').update({ spent: revSpend   }).eq('id','fb_revenue');
    results.synced.push('fb_branding','fb_revenue');
  } catch(e) { results.errors.push({ channel:'meta', error: e.message }); }

  // ── FB / IG Organic ─────────────────────────────
  try {
    const token  = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;
    const url    = `https://graph.facebook.com/v19.0/${pageId}/insights?metric=page_impressions,page_reach,page_post_engagements,page_fan_adds_unique&period=month&access_token=${token}`;
    const r      = await fetch(url);
    const data   = await r.json();
    if (data.error) throw new Error(data.error.message);
    const byName = {};
    (data.data||[]).forEach(m => { byName[m.name] = m.values?.[m.values.length-1]?.value||0; });
    const reach        = parseInt(byName['page_reach']||0);
    const impressions  = parseInt(byName['page_impressions']||0);
    const engagements  = parseInt(byName['page_post_engagements']||0);
    const followers    = parseInt(byName['page_fan_adds_unique']||0);
    const engRate      = reach>0 ? parseFloat((engagements/reach*100).toFixed(2)) : 0;

    await upsertActual('fb_organic','reach',            reach,                      month,year);
    await upsertActual('fb_organic','impressions',      impressions,                month,year);
    await upsertActual('fb_organic','engagement_rate',  engRate,                    month,year);
    await upsertActual('fb_organic','followers_gained', followers,                  month,year);
    await upsertActual('fb_organic','reactions',        Math.round(engagements*0.7),month,year);
    await upsertActual('fb_organic','shares',           Math.round(engagements*0.1),month,year);
    results.synced.push('fb_organic');
  } catch(e) { results.errors.push({ channel:'fb_organic', error: e.message }); }

  // ── Google Search Console ────────────────────────
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GSC_REFRESH_TOKEN });
    const sc = google.searchconsole({ version:'v1', auth });
    const r  = await sc.searchanalytics.query({
      siteUrl: process.env.GSC_SITE_URL,
      requestBody: { startDate: start, endDate: end, dimensions: [], rowLimit: 1 }
    });
    const row = r.data?.rows?.[0] || {};
    await upsertActual('seo','clicks',       Math.round(row.clicks||0),                    month,year);
    await upsertActual('seo','impressions',  Math.round(row.impressions||0),               month,year);
    await upsertActual('seo','ctr',          parseFloat(((row.ctr||0)*100).toFixed(2)),    month,year);
    await upsertActual('seo','avg_position', parseFloat((row.position||0).toFixed(1)),     month,year);
    results.synced.push('seo');
  } catch(e) { results.errors.push({ channel:'seo', error: e.message }); }

  // ── Factory Pages (Google Sheets) ───────────────
  try {
    const sheetId = process.env.FACTORY_SHEET_ID;
    const tabName = process.env.FACTORY_TAB_NAME || 'Sheet1';
    const apiKey  = process.env.GOOGLE_SHEETS_API_KEY;
    // Row 1 = headers, Row 2+ = data rows. Find row matching current month.
    const range   = encodeURIComponent(`${tabName}!A:Z`);
    const url     = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
    const r       = await fetch(url);
    const d       = await r.json();
    const rows    = d.values || [];
    if (rows.length < 2) throw new Error('No data rows in Factory sheet');
    const headers = rows[0];
    // Find data row matching month/year — expects a column named "month" or "date"
    const monthIdx = headers.findIndex(h => h.toLowerCase().includes('month') || h.toLowerCase().includes('date'));
    let dataRow = rows[1]; // default to first data row
    if (monthIdx >= 0) {
      const match = rows.slice(1).find(row => {
        const val = row[monthIdx]?.toLowerCase()||'';
        return val.includes(month.toString()) || val.includes(year.toString());
      });
      if (match) dataRow = match;
    }
    headers.forEach((h, i) => {
      const key = h.toLowerCase().replace(/\s+/g,'_');
      const val = parseFloat(dataRow[i]||0);
      if (!isNaN(val)) upsertActual('factory', key, val, month, year);
    });
    results.synced.push('factory');
  } catch(e) { results.errors.push({ channel:'factory', error: e.message }); }

  res.json({ success:true, month, year, date_range:{start,end}, synced_at: new Date().toISOString(), ...results });
});

app.listen(PORT, () => console.log(`Kapruka Dashboard API v3 running on port ${PORT}`));
