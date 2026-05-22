// ERP Feature: Multi-Entity Consolidations
// 18 CRUD + 16 AI verbs
// Mounted under: /api/erp/consolidations
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
    CREATE TABLE IF NOT EXISTS erp_consolidations (
      id SERIAL PRIMARY KEY,
      consolidation_id VARCHAR(100) UNIQUE NOT NULL,
      consolidation_name VARCHAR(255),
      parent_entity_id INTEGER,
      child_entity_ids JSONB,
      fiscal_period VARCHAR(20),
      fiscal_year INTEGER,
      reporting_currency VARCHAR(10) DEFAULT 'USD',
      status VARCHAR(30) DEFAULT 'Draft',
      consolidation_method VARCHAR(30) DEFAULT 'Full',
      ownership_pct NUMERIC(5,2) DEFAULT 100,
      minority_interest_pct NUMERIC(5,2) DEFAULT 0,
      eliminations JSONB,
      fx_translation_rates JSONB,
      total_revenue NUMERIC(18,4) DEFAULT 0,
      total_assets NUMERIC(18,4) DEFAULT 0,
      total_liabilities NUMERIC(18,4) DEFAULT 0,
      total_equity NUMERIC(18,4) DEFAULT 0,
      interco_eliminations_total NUMERIC(18,4) DEFAULT 0,
      cta_amount NUMERIC(18,4) DEFAULT 0,
      mapping_gaps INTEGER DEFAULT 0,
      is_archived BOOLEAN DEFAULT false,
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
    if (req.query.status) { params.push(req.query.status); where.push(`status=$${params.length}`); }
    if (req.query.fiscal_year) { params.push(req.query.fiscal_year); where.push(`fiscal_year=$${params.length}`); }
    const wc = `WHERE ${where.join(' AND ')}`;
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_consolidations ${wc}`, params);
    const total = parseInt(cnt.rows[0].count);
    params.push(limit); params.push(offset);
    const rows = await pool.query(`SELECT * FROM erp_consolidations ${wc} ORDER BY fiscal_year DESC, fiscal_period DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. GET /count
router.get('/count', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('SELECT COUNT(*) FROM erp_consolidations WHERE is_archived=false');
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
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_consolidations WHERE (consolidation_id ILIKE $1 OR consolidation_name ILIKE $1) AND is_archived=false`, [q]);
    const total = parseInt(cnt.rows[0].count);
    const rows = await pool.query(`SELECT * FROM erp_consolidations WHERE (consolidation_id ILIKE $1 OR consolidation_name ILIKE $1) AND is_archived=false ORDER BY fiscal_year DESC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET /by-parent/:parentEntityId
router.get('/by-parent/:parentEntityId', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_consolidations WHERE parent_entity_id=$1 AND is_archived=false ORDER BY fiscal_year DESC', [req.params.parentEntityId]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GET /by-period/:period
router.get('/by-period/:period', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_consolidations WHERE fiscal_period=$1 AND is_archived=false ORDER BY fiscal_year DESC', [req.params.period]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. GET /export/csv
router.get('/export/csv', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT id,consolidation_id,consolidation_name,parent_entity_id,fiscal_period,fiscal_year,reporting_currency,status,consolidation_method,ownership_pct,minority_interest_pct,total_revenue,total_assets,total_liabilities,total_equity,interco_eliminations_total,cta_amount,mapping_gaps,created_at FROM erp_consolidations ORDER BY fiscal_year DESC');
    const fields = ['id','consolidation_id','consolidation_name','parent_entity_id','fiscal_period','fiscal_year','reporting_currency','status','consolidation_method','ownership_pct','minority_interest_pct','total_revenue','total_assets','total_liabilities','total_equity','interco_eliminations_total','cta_amount','mapping_gaps','created_at'];
    const header = fields.join(',');
    const csv = [header, ...rows.rows.map(r => fields.map(f => `"${String(r[f]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="consolidations.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. GET /stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    await ensureTable();
    const [byStatus, totals] = await Promise.all([
      pool.query('SELECT status, COUNT(*) FROM erp_consolidations WHERE is_archived=false GROUP BY status'),
      pool.query('SELECT SUM(total_revenue) as total_rev, SUM(interco_eliminations_total) as total_elim, SUM(cta_amount) as total_cta, SUM(mapping_gaps) as total_gaps FROM erp_consolidations WHERE is_archived=false')
    ]);
    res.json({ byStatus: byStatus.rows, totals: totals.rows[0] });
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
        'INSERT INTO erp_consolidations (consolidation_id,consolidation_name,parent_entity_id,child_entity_ids,fiscal_period,fiscal_year,reporting_currency,status,consolidation_method,ownership_pct,minority_interest_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
        [item.consolidation_id,item.consolidation_name||null,item.parent_entity_id||null,item.child_entity_ids?JSON.stringify(item.child_entity_ids):null,item.fiscal_period||null,item.fiscal_year||new Date().getFullYear(),item.reporting_currency||'USD',item.status||'Draft',item.consolidation_method||'Full',item.ownership_pct||100,item.minority_interest_pct||0]
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
      const r = await pool.query(`UPDATE erp_consolidations SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...Object.values(fields)]);
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
    const r = await pool.query(`UPDATE erp_consolidations SET status='Cancelled', updated_at=NOW() WHERE id = ANY($1::int[])`, [ids]);
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
        const r = await pool.query('INSERT INTO erp_consolidations (consolidation_id,consolidation_name,fiscal_year) VALUES ($1,$2,$3) ON CONFLICT (consolidation_id) DO NOTHING RETURNING *',
          [obj.consolidation_id, obj.consolidation_name||null, obj.fiscal_year||new Date().getFullYear()]);
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
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. POST /
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const r = await pool.query(
      'INSERT INTO erp_consolidations (consolidation_id,consolidation_name,parent_entity_id,child_entity_ids,fiscal_period,fiscal_year,reporting_currency,status,consolidation_method,ownership_pct,minority_interest_pct,eliminations,fx_translation_rates,total_revenue,total_assets,total_liabilities,total_equity,interco_eliminations_total,cta_amount,mapping_gaps) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *',
      [b.consolidation_id,b.consolidation_name||null,b.parent_entity_id||null,b.child_entity_ids?JSON.stringify(b.child_entity_ids):null,b.fiscal_period||null,b.fiscal_year||new Date().getFullYear(),b.reporting_currency||'USD',b.status||'Draft',b.consolidation_method||'Full',b.ownership_pct||100,b.minority_interest_pct||0,b.eliminations?JSON.stringify(b.eliminations):null,b.fx_translation_rates?JSON.stringify(b.fx_translation_rates):null,b.total_revenue||0,b.total_assets||0,b.total_liabilities||0,b.total_equity||0,b.interco_eliminations_total||0,b.cta_amount||0,b.mapping_gaps||0]
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
    const r = await pool.query(`UPDATE erp_consolidations SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(b)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_consolidations SET status='Cancelled', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. POST /:id/archive
router.post('/:id/archive', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_consolidations SET is_archived=true, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. POST /:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_consolidations SET is_archived=false, status='Draft', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. GET /:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM audit_logs WHERE entity_type='erp_consolidations' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI verbs ──────────────────────────────────────────────────────────────────

router.post('/ai/detect-elimination-miss', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a consolidation expert. Detect missed intercompany eliminations.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"missed_eliminations":[{"account":"...","entity":"...","amount":0,"reason":"..."}],"total_missed":0,"severity":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-elimination-entry', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId, icBalance } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a consolidation accountant. Suggest journal entries for intercompany eliminations.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}, IC balance: ${JSON.stringify(icBalance)}. JSON: {"journal_entries":[{"debit_account":"...","credit_account":"...","amount":0,"narration":"..."}],"total_elimination":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-intercompany-match', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a consolidation validator. Validate intercompany matching.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"match_status":"matched|partial|unmatched","unmatched_items":[{"entity_a":"...","entity_b":"...","account":"...","difference":0}],"total_difference":0,"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-consol-issue', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a consolidation risk expert. Predict consolidation issues before close.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"predicted_issues":[{"issue":"...","probability":"high|medium|low","impact":"...","preventive_action":"..."}],"overall_risk":"...","recommended_pre_close_actions":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-cta-narrative', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a financial reporting expert. Generate a Cumulative Translation Adjustment (CTA) narrative.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"cta_narrative":"...","key_currency_movements":"...","period_cta":0,"cumulative_cta":0,"accounting_treatment":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-non-controlling-interest', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are an NCI accounting expert. Classify and calculate non-controlling interest.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"nci_amount":0,"nci_pct":0,"nci_in_equity":0,"nci_in_profit":0,"measurement_basis":"fair_value|proportionate_share","disclosure_notes":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-fx-rate-change', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId, currentRates } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are an FX rate expert. Recommend FX rate adjustments for consolidation.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}, Current rates: ${JSON.stringify(currentRates)}. JSON: {"rate_recommendations":[{"currency":"...","current_rate":0,"recommended_rate":0,"rate_type":"spot|average|historical","rationale":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-consolidation-result', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a financial reporting expert. Summarize the consolidation results.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"executive_summary":"...","key_metrics":{"revenue":0,"assets":0,"equity":0},"significant_items":[...],"audit_ready":true|false,"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-mapping-gap', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a consolidation mapping expert. Detect account mapping gaps.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"mapping_gaps":[{"entity":"...","source_account":"...","issue":"not_mapped|multiple_targets|incorrect_target","impact":0}],"total_unmapped_value":0,"resolution_steps":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-consolidation-readiness', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a consolidation readiness expert. Score how ready this consolidation is for close.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"readiness_score":0-100,"grade":"A|B|C|D|F","blockers":[...],"warnings":[...],"estimated_close_date":"YYYY-MM-DD"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-entity-cleanup', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const consolidations = await pool.query('SELECT * FROM erp_consolidations WHERE is_archived=false ORDER BY mapping_gaps DESC LIMIT 20');
    const sys = 'You are a consolidation data steward. Suggest entity cleanup actions.';
    const user = `Consolidations: ${JSON.stringify(consolidations.rows)}. JSON: {"cleanup_actions":[{"consolidation_id":"...","action":"...","priority":"high|medium|low","effort":"hours"}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-equity-pickup', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a consolidation accounting expert. Validate equity pickup calculations.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"equity_pickup_valid":true|false,"calculated_pickup":0,"expected_pickup":0,"difference":0,"issues":[...],"recommended_adjustment":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-board-package', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a CFO analyst. Generate a board package summary from consolidation results.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"headline_metrics":"...","revenue_commentary":"...","balance_sheet_commentary":"...","fx_impact_commentary":"...","key_risks":[...],"management_actions_required":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-restatement-risk', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a financial restatement risk expert.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}. JSON: {"restatement_risk":"low|medium|high|critical","risk_factors":[...],"probability_pct":0,"areas_of_concern":[...],"preventive_controls":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-purchase-accounting-adj', aiRateLimit, async (req, res) => {
  try {
    const { consolidationId, acquisitionData } = req.body;
    const r = await pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [consolidationId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a purchase accounting expert. Classify purchase price allocation adjustments.';
    const user = `Consolidation: ${JSON.stringify(r.rows[0])}, Acquisition data: ${JSON.stringify(acquisitionData)}. JSON: {"ppa_adjustments":[{"asset":"...","fair_value_adjustment":0,"useful_life_years":0,"amortization_method":"..."}],"goodwill":0,"bargain_purchase":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/explain-period-variance', aiRateLimit, async (req, res) => {
  try {
    const { currentConsolidationId, priorConsolidationId } = req.body;
    const [curr, prior] = await Promise.all([
      pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [currentConsolidationId]),
      pool.query('SELECT * FROM erp_consolidations WHERE id=$1', [priorConsolidationId])
    ]);
    if (!curr.rows[0] || !prior.rows[0]) return res.status(404).json({ error: 'Consolidation not found' });
    const sys = 'You are a financial analyst. Explain period-over-period variance in consolidation results.';
    const user = `Current: ${JSON.stringify(curr.rows[0])}, Prior: ${JSON.stringify(prior.rows[0])}. JSON: {"revenue_variance":0,"asset_variance":0,"equity_variance":0,"fx_impact":0,"organic_growth":0,"drivers":[...],"narrative":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
