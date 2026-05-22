// ERP Feature: Multi-Currency
// 18 CRUD + 16 AI verbs
// Mounted under: /api/erp/multi-currency
'use strict';

const express = require('express');
const https = require('https');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const pool = require('../db');
const router = express.Router();

function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user; next();
  });
}
router.use(authenticateToken);

const _rlMap = new Map();
function aiRateLimit(req, res, next) {
  const key = `user:${req.user?.id || req.ip}`;
  const now = Date.now(); const win = 60 * 60 * 1000;
  const e = _rlMap.get(key) || { count: 0, resetAt: now + win };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + win; }
  e.count++; _rlMap.set(key, e);
  if (e.count > 20) return res.status(429).json({ error: 'AI rate limit exceeded (20/hr)' });
  next();
}

async function callAI(sys, user) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { success: false, error: 'OPENROUTER_API_KEY not configured' };
  return new Promise((resolve) => {
    const data = JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 1500, temperature: 0.4 });
    const opts = { hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'AI Manufacturing ERP' } };
    const req = https.request(opts, (r) => {
      let body = ''; r.on('data', c => body += c);
      r.on('end', () => {
        try {
          const p = JSON.parse(body);
          if (p.error) return resolve({ success: false, error: p.error.message });
          resolve({ success: true, content: p.choices?.[0]?.message?.content || '', usage: p.usage, model: p.model });
        } catch (ex) { resolve({ success: false, error: 'Parse error' }); }
      });
    });
    req.on('error', ex => resolve({ success: false, error: ex.message }));
    req.write(data); req.end();
  });
}

function parseJson(text) {
  if (!text) return { raw: '' };
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1].trim()); } catch (_) {} }
  try { return JSON.parse(text); } catch (_) {}
  const m2 = text.match(/\{[\s\S]*\}/);
  if (m2) { try { return JSON.parse(m2[0]); } catch (_) {} }
  return { raw: text };
}

let _ready = false;
async function ensureTable() {
  if (_ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_fx_rates (
      id SERIAL PRIMARY KEY,
      rate_id VARCHAR(100) UNIQUE NOT NULL,
      from_currency VARCHAR(10) NOT NULL,
      to_currency VARCHAR(10) NOT NULL,
      rate_type VARCHAR(30) DEFAULT 'Spot',
      exchange_rate NUMERIC(18,8) NOT NULL,
      rate_date DATE NOT NULL,
      rate_source VARCHAR(100),
      entity_id INTEGER,
      is_active BOOLEAN DEFAULT true,
      is_archived BOOLEAN DEFAULT false,
      fx_gain_loss NUMERIC(18,4) DEFAULT 0,
      revaluation_amount NUMERIC(18,4) DEFAULT 0,
      hedge_rate NUMERIC(18,8),
      hedge_effective BOOLEAN DEFAULT false,
      exposure_type VARCHAR(50),
      monetary_flag BOOLEAN DEFAULT true,
      translation_method VARCHAR(30) DEFAULT 'CurrentRate',
      ai_notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  _ready = true;
}

// 1. GET /
router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const where = ['is_archived=false']; const params = [];
    if (req.query.from_currency) { params.push(req.query.from_currency); where.push(`from_currency=$${params.length}`); }
    if (req.query.to_currency) { params.push(req.query.to_currency); where.push(`to_currency=$${params.length}`); }
    if (req.query.rate_type) { params.push(req.query.rate_type); where.push(`rate_type=$${params.length}`); }
    const wc = `WHERE ${where.join(' AND ')}`;
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_fx_rates ${wc}`, params);
    const total = parseInt(cnt.rows[0].count);
    params.push(limit); params.push(offset);
    const rows = await pool.query(`SELECT * FROM erp_fx_rates ${wc} ORDER BY rate_date DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. GET /count
router.get('/count', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('SELECT COUNT(*) FROM erp_fx_rates WHERE is_archived=false');
    res.json({ count: parseInt(r.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. GET /search
router.get('/search', async (req, res) => {
  try {
    await ensureTable();
    const q = `%${req.query.q || ''}%`;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_fx_rates WHERE (rate_id ILIKE $1 OR from_currency ILIKE $1 OR to_currency ILIKE $1 OR rate_source ILIKE $1) AND is_archived=false`, [q]);
    const total = parseInt(cnt.rows[0].count);
    const rows = await pool.query(`SELECT * FROM erp_fx_rates WHERE (rate_id ILIKE $1 OR from_currency ILIKE $1 OR to_currency ILIKE $1 OR rate_source ILIKE $1) AND is_archived=false ORDER BY rate_date DESC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET /by-currency/:currency
router.get('/by-currency/:currency', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_fx_rates WHERE (from_currency=$1 OR to_currency=$1) AND is_archived=false ORDER BY rate_date DESC', [req.params.currency]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GET /by-date/:date
router.get('/by-date/:date', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_fx_rates WHERE rate_date=$1 AND is_archived=false ORDER BY from_currency', [req.params.date]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. GET /export/csv
router.get('/export/csv', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT id,rate_id,from_currency,to_currency,rate_type,exchange_rate,rate_date,rate_source,entity_id,is_active,fx_gain_loss,revaluation_amount,hedge_rate,hedge_effective,exposure_type,monetary_flag,translation_method,created_at FROM erp_fx_rates ORDER BY rate_date DESC');
    const fields = ['id','rate_id','from_currency','to_currency','rate_type','exchange_rate','rate_date','rate_source','entity_id','is_active','fx_gain_loss','revaluation_amount','hedge_rate','hedge_effective','exposure_type','monetary_flag','translation_method','created_at'];
    const header = fields.join(',');
    const csv = [header, ...rows.rows.map(r => fields.map(f => `"${String(r[f]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="fx_rates.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. GET /stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    await ensureTable();
    const [byType, currencies, totals] = await Promise.all([
      pool.query('SELECT rate_type, COUNT(*) FROM erp_fx_rates WHERE is_archived=false GROUP BY rate_type'),
      pool.query('SELECT DISTINCT from_currency FROM erp_fx_rates WHERE is_archived=false'),
      pool.query('SELECT SUM(fx_gain_loss) as total_gl, SUM(revaluation_amount) as total_reval FROM erp_fx_rates WHERE is_archived=false')
    ]);
    res.json({ byRateType: byType.rows, activeCurrencies: currencies.rows.map(r => r.from_currency), totals: totals.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8. POST /batch
router.post('/batch', async (req, res) => {
  try {
    await ensureTable();
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });
    const created = [];
    for (const item of items) {
      const r = await pool.query(
        'INSERT INTO erp_fx_rates (rate_id,from_currency,to_currency,rate_type,exchange_rate,rate_date,rate_source,entity_id,exposure_type,monetary_flag,translation_method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
        [item.rate_id,item.from_currency,item.to_currency,item.rate_type||'Spot',item.exchange_rate,item.rate_date,item.rate_source||null,item.entity_id||null,item.exposure_type||null,item.monetary_flag!==false,item.translation_method||'CurrentRate']
      );
      created.push(r.rows[0]);
    }
    res.status(201).json({ data: created, count: created.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 9. PUT /batch
router.put('/batch', async (req, res) => {
  try {
    await ensureTable();
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });
    const results = [];
    for (const { id, ...fields } of items) {
      if (!id) { results.push({ error: 'missing id' }); continue; }
      const sets = Object.keys(fields).map((k, i) => `${k}=$${i+2}`).join(',');
      if (!sets) { results.push({ error: 'no fields', id }); continue; }
      const r = await pool.query(`UPDATE erp_fx_rates SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...Object.values(fields)]);
      results.push(r.rows[0] || { error: 'not found', id });
    }
    res.json({ data: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 10. DELETE /batch
router.delete('/batch', async (req, res) => {
  try {
    await ensureTable();
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
    const r = await pool.query(`UPDATE erp_fx_rates SET is_active=false, updated_at=NOW() WHERE id = ANY($1::int[])`, [ids]);
    res.json({ updated: r.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 11. POST /import/csv
router.post('/import/csv', async (req, res) => {
  try {
    await ensureTable();
    const { csv } = req.body;
    if (!csv) return res.status(400).json({ error: 'csv field required' });
    const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header + at least one row' });
    const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim());
    const created = [];
    for (const line of lines.slice(1)) {
      const vals = (line.match(/(".*?"|[^,]+)/g) || []).map(v => v.replace(/^"|"$/g,'').replace(/""/g,'"'));
      const obj = {}; headers.forEach((h, i) => { obj[h] = vals[i] || null; });
      try {
        const r = await pool.query('INSERT INTO erp_fx_rates (rate_id,from_currency,to_currency,exchange_rate,rate_date) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (rate_id) DO NOTHING RETURNING *',
          [obj.rate_id, obj.from_currency, obj.to_currency, obj.exchange_rate||1, obj.rate_date||new Date().toISOString().split('T')[0]]);
        if (r.rows[0]) created.push(r.rows[0]);
      } catch (_) {}
    }
    res.status(201).json({ data: created, count: created.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 12. GET /:id
router.get('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('SELECT * FROM erp_fx_rates WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. POST /
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const r = await pool.query(
      'INSERT INTO erp_fx_rates (rate_id,from_currency,to_currency,rate_type,exchange_rate,rate_date,rate_source,entity_id,fx_gain_loss,revaluation_amount,hedge_rate,hedge_effective,exposure_type,monetary_flag,translation_method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
      [b.rate_id,b.from_currency,b.to_currency,b.rate_type||'Spot',b.exchange_rate,b.rate_date,b.rate_source||null,b.entity_id||null,b.fx_gain_loss||0,b.revaluation_amount||0,b.hedge_rate||null,b.hedge_effective||false,b.exposure_type||null,b.monetary_flag!==false,b.translation_method||'CurrentRate']
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 14. PUT /:id
router.put('/:id', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const fields = Object.keys(b);
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    const sets = fields.map((k, i) => `${k}=$${i+2}`).join(',');
    const r = await pool.query(`UPDATE erp_fx_rates SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(b)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_fx_rates SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. POST /:id/archive
router.post('/:id/archive', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_fx_rates SET is_archived=true, is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. POST /:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_fx_rates SET is_archived=false, is_active=true, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. GET /:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM audit_logs WHERE entity_type='erp_fx_rates' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI verbs ──────────────────────────────────────────────────────────────────

router.post('/ai/predict-fx-impact', aiRateLimit, async (req, res) => {
  try {
    const { fromCurrency, toCurrency, exposure, horizon } = req.body;
    const recent = await pool.query('SELECT * FROM erp_fx_rates WHERE from_currency=$1 AND to_currency=$2 AND is_archived=false ORDER BY rate_date DESC LIMIT 12', [fromCurrency, toCurrency]);
    const sys = 'You are an FX risk expert. Predict the FX impact on financial results.';
    const user = `Currency pair: ${fromCurrency}/${toCurrency}, Exposure: ${exposure}, Horizon: ${horizon}, Recent rates: ${JSON.stringify(recent.rows)}. JSON: {"predicted_rate":0,"rate_range":{"low":0,"high":0},"expected_fx_impact":0,"risk_level":"low|medium|high","hedging_recommendation":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-hedge-strategy', aiRateLimit, async (req, res) => {
  try {
    const { currency, exposureAmount, exposureType, horizon } = req.body;
    const sys = 'You are an FX hedging expert. Suggest an optimal hedging strategy.';
    const user = `Currency: ${currency}, Exposure: ${exposureAmount}, Type: ${exposureType}, Horizon: ${horizon}. JSON: {"recommended_instrument":"forward|option|swap|natural_hedge","hedge_ratio_pct":0,"estimated_cost":0,"breakeven_rate":0,"rationale":"...","alternative_strategies":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-fx-misposting', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const rates = await pool.query('SELECT * FROM erp_fx_rates WHERE is_archived=false ORDER BY rate_date DESC LIMIT 50');
    const sys = 'You are an FX audit expert. Detect mispostings due to incorrect FX rates.';
    const user = `FX rates: ${JSON.stringify(rates.rows)}. JSON: {"mispostings":[{"rate_id":"...","issue":"...","expected_rate":0,"actual_rate":0,"estimated_impact":0}],"total_impact":0,"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-exposure-type', aiRateLimit, async (req, res) => {
  try {
    const { rateId } = req.body;
    const r = await pool.query('SELECT * FROM erp_fx_rates WHERE id=$1', [rateId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    const sys = 'You are an FX exposure classification expert.';
    const user = `FX rate record: ${JSON.stringify(r.rows[0])}. JSON: {"exposure_type":"transaction|translation|economic","description":"...","accounting_treatment":"...","hedge_qualification":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-revaluation', aiRateLimit, async (req, res) => {
  try {
    const { rateId } = req.body;
    const r = await pool.query('SELECT * FROM erp_fx_rates WHERE id=$1', [rateId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    const sys = 'You are an FX revaluation expert. Validate the revaluation calculation.';
    const user = `FX rate: ${JSON.stringify(r.rows[0])}. JSON: {"revaluation_valid":true|false,"expected_revaluation":0,"actual_revaluation":0,"difference":0,"issues":[...],"corrective_journal_entry":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-fx-narrative', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const rates = await pool.query('SELECT * FROM erp_fx_rates WHERE is_archived=false ORDER BY rate_date DESC LIMIT 20');
    const sys = 'You are a financial reporting expert. Generate an FX narrative for the period.';
    const user = `FX rates: ${JSON.stringify(rates.rows)}. JSON: {"narrative":"...","key_currency_movements":[{"pair":"...","change_pct":0,"impact":"..."}],"total_fx_gain_loss":0,"management_commentary":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-functional-currency-change', aiRateLimit, async (req, res) => {
  try {
    const { entityId, currentFunctionalCurrency, operatingCurrencies } = req.body;
    const sys = 'You are an IFRS/GAAP functional currency expert.';
    const user = `Entity: ${entityId}, Current functional currency: ${currentFunctionalCurrency}, Operating currencies: ${JSON.stringify(operatingCurrencies)}. JSON: {"change_recommended":true|false,"recommended_currency":"...","rationale":"...","accounting_impact":"...","transition_considerations":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-fx-gain-loss', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const data = await pool.query('SELECT from_currency, to_currency, SUM(fx_gain_loss) as total_gl, COUNT(*) FROM erp_fx_rates WHERE is_archived=false GROUP BY from_currency, to_currency ORDER BY total_gl DESC');
    const sys = 'You are a financial analyst. Summarize FX gain/loss for the period.';
    const user = `FX gain/loss by pair: ${JSON.stringify(data.rows)}. JSON: {"summary":"...","total_net_gl":0,"top_gain_pairs":[...],"top_loss_pairs":[...],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-translation-quality', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const rates = await pool.query('SELECT rate_type, COUNT(*), AVG(exchange_rate) FROM erp_fx_rates WHERE is_archived=false GROUP BY rate_type');
    const sys = 'You are an FX translation quality expert. Score translation quality.';
    const user = `Rate coverage: ${JSON.stringify(rates.rows)}. JSON: {"translation_quality_score":0-100,"completeness":"...","consistency":"...","issues":[...],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-rate-anomaly', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const rates = await pool.query('SELECT * FROM erp_fx_rates WHERE is_archived=false ORDER BY rate_date DESC LIMIT 50');
    const sys = 'You are an FX data quality expert. Detect anomalous exchange rates.';
    const user = `FX rates: ${JSON.stringify(rates.rows)}. JSON: {"anomalies":[{"rate_id":"...","from_currency":"...","to_currency":"...","anomaly_type":"spike|outlier|stale|reversed","expected_range":{"low":0,"high":0},"actual_rate":0,"recommendation":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-rate-source', aiRateLimit, async (req, res) => {
  try {
    const { fromCurrency, toCurrency, rateType } = req.body;
    const sys = 'You are an FX rate sourcing expert. Recommend authoritative FX rate sources.';
    const user = `Pair: ${fromCurrency}/${toCurrency}, Type: ${rateType}. JSON: {"recommended_sources":[{"source":"...","reliability":"high|medium|low","update_frequency":"...","free_access":true|false,"api_available":true|false}],"primary_recommendation":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-historical-rate', aiRateLimit, async (req, res) => {
  try {
    const { rateId } = req.body;
    const r = await pool.query('SELECT * FROM erp_fx_rates WHERE id=$1', [rateId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    const sys = 'You are an FX rate validation expert. Validate this historical exchange rate.';
    const user = `FX rate: ${JSON.stringify(r.rows[0])}. JSON: {"rate_valid":true|false,"expected_range":{"low":0,"high":0},"source_credibility":"...","issues":[...],"recommended_corrective_action":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-monetary-non-monetary', aiRateLimit, async (req, res) => {
  try {
    const { accountType, accountName, description } = req.body;
    const sys = 'You are an FX translation expert. Classify this balance sheet item as monetary or non-monetary.';
    const user = `Account type: ${accountType}, Name: ${accountName}, Description: ${description}. JSON: {"classification":"monetary|non-monetary","translation_rate":"current|historical|average","rationale":"...","examples":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-hedge-effectiveness', aiRateLimit, async (req, res) => {
  try {
    const { rateId } = req.body;
    const r = await pool.query('SELECT * FROM erp_fx_rates WHERE id=$1', [rateId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    const sys = 'You are a hedge accounting expert. Predict hedge effectiveness.';
    const user = `Hedge instrument: ${JSON.stringify(r.rows[0])}. JSON: {"effectiveness_ratio":0,"hedge_qualifies":true|false,"ineffectiveness_amount":0,"accounting_treatment":"fair_value|cash_flow|net_investment","prospective_test":"pass|fail","retrospective_test":"pass|fail"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-hedge-doc', aiRateLimit, async (req, res) => {
  try {
    const { rateId } = req.body;
    const r = await pool.query('SELECT * FROM erp_fx_rates WHERE id=$1', [rateId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'FX rate not found' });
    const sys = 'You are a hedge accounting specialist. Generate hedge designation documentation.';
    const user = `Hedge instrument: ${JSON.stringify(r.rows[0])}. JSON: {"hedge_designation":"...","risk_management_objective":"...","hedging_relationship":"...","hedged_item":"...","hedging_instrument":"...","effectiveness_assessment_method":"...","designation_date":"YYYY-MM-DD"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/explain-translation-difference', aiRateLimit, async (req, res) => {
  try {
    const { entityId, period, reportingCurrency, functionalCurrency } = req.body;
    const rates = await pool.query('SELECT * FROM erp_fx_rates WHERE entity_id=$1 AND is_archived=false ORDER BY rate_date DESC LIMIT 12', [entityId]);
    const sys = 'You are an FX translation expert. Explain the translation difference for this entity.';
    const user = `Entity: ${entityId}, Period: ${period}, Reporting: ${reportingCurrency}, Functional: ${functionalCurrency}, Rates: ${JSON.stringify(rates.rows)}. JSON: {"translation_difference":0,"causes":[{"factor":"...","amount":0}],"cta_impact":0,"explanation":"...","disclosure_text":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
