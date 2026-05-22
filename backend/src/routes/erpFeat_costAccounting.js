// ERP Feature: Cost Accounting
// 18 CRUD + 16 AI verbs
// Mounted under: /api/erp/cost-accounting
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
    CREATE TABLE IF NOT EXISTS erp_cost_records (
      id SERIAL PRIMARY KEY,
      record_number VARCHAR(100) UNIQUE NOT NULL,
      cost_type VARCHAR(30) DEFAULT 'Standard',
      sku VARCHAR(100),
      item_name VARCHAR(255),
      cost_center VARCHAR(50),
      entity_id INTEGER,
      fiscal_period VARCHAR(20),
      fiscal_year INTEGER,
      standard_cost NUMERIC(18,4) DEFAULT 0,
      actual_cost NUMERIC(18,4) DEFAULT 0,
      variance_amount NUMERIC(18,4) DEFAULT 0,
      variance_pct NUMERIC(8,4) DEFAULT 0,
      material_cost NUMERIC(18,4) DEFAULT 0,
      labor_cost NUMERIC(18,4) DEFAULT 0,
      overhead_cost NUMERIC(18,4) DEFAULT 0,
      overhead_rate NUMERIC(8,4) DEFAULT 0,
      allocation_method VARCHAR(50),
      allocation_base VARCHAR(50),
      absorption_amount NUMERIC(18,4) DEFAULT 0,
      volume_variance NUMERIC(18,4) DEFAULT 0,
      price_variance NUMERIC(18,4) DEFAULT 0,
      efficiency_variance NUMERIC(18,4) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'Open',
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
    if (req.query.cost_type) { params.push(req.query.cost_type); where.push(`cost_type=$${params.length}`); }
    if (req.query.fiscal_year) { params.push(req.query.fiscal_year); where.push(`fiscal_year=$${params.length}`); }
    if (req.query.fiscal_period) { params.push(req.query.fiscal_period); where.push(`fiscal_period=$${params.length}`); }
    const wc = `WHERE ${where.join(' AND ')}`;
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_cost_records ${wc}`, params);
    const total = parseInt(cnt.rows[0].count);
    params.push(limit); params.push(offset);
    const rows = await pool.query(`SELECT * FROM erp_cost_records ${wc} ORDER BY fiscal_year DESC, fiscal_period DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. GET /count
router.get('/count', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('SELECT COUNT(*) FROM erp_cost_records WHERE is_archived=false');
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
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_cost_records WHERE (record_number ILIKE $1 OR sku ILIKE $1 OR item_name ILIKE $1 OR cost_center ILIKE $1) AND is_archived=false`, [q]);
    const total = parseInt(cnt.rows[0].count);
    const rows = await pool.query(`SELECT * FROM erp_cost_records WHERE (record_number ILIKE $1 OR sku ILIKE $1 OR item_name ILIKE $1 OR cost_center ILIKE $1) AND is_archived=false ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET /by-cost-center/:costCenter
router.get('/by-cost-center/:costCenter', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_cost_records WHERE cost_center=$1 AND is_archived=false ORDER BY fiscal_year DESC, fiscal_period DESC', [req.params.costCenter]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GET /by-sku/:sku
router.get('/by-sku/:sku', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_cost_records WHERE sku=$1 AND is_archived=false ORDER BY fiscal_year DESC, fiscal_period DESC', [req.params.sku]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. GET /export/csv
router.get('/export/csv', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_cost_records ORDER BY fiscal_year DESC, fiscal_period DESC');
    const fields = ['id','record_number','cost_type','sku','item_name','cost_center','entity_id','fiscal_period','fiscal_year','standard_cost','actual_cost','variance_amount','variance_pct','material_cost','labor_cost','overhead_cost','overhead_rate','allocation_method','absorption_amount','volume_variance','price_variance','efficiency_variance','status','created_at'];
    const header = fields.join(',');
    const csv = [header, ...rows.rows.map(r => fields.map(f => `"${String(r[f]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cost_accounting.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. GET /stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    await ensureTable();
    const [byType, totals, byCostCenter] = await Promise.all([
      pool.query('SELECT cost_type, COUNT(*), AVG(variance_pct) as avg_variance FROM erp_cost_records WHERE is_archived=false GROUP BY cost_type'),
      pool.query('SELECT SUM(variance_amount) as total_variance, SUM(actual_cost) as total_actual, SUM(standard_cost) as total_standard, SUM(absorption_amount) as total_absorption FROM erp_cost_records WHERE is_archived=false'),
      pool.query('SELECT cost_center, SUM(variance_amount) as total_variance FROM erp_cost_records WHERE is_archived=false GROUP BY cost_center ORDER BY total_variance DESC LIMIT 10')
    ]);
    res.json({ byCostType: byType.rows, totals: totals.rows[0], topVarianceCenters: byCostCenter.rows });
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
        'INSERT INTO erp_cost_records (record_number,cost_type,sku,item_name,cost_center,entity_id,fiscal_period,fiscal_year,standard_cost,actual_cost,variance_amount,variance_pct,material_cost,labor_cost,overhead_cost,overhead_rate,allocation_method,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *',
        [item.record_number,item.cost_type||'Standard',item.sku||null,item.item_name||null,item.cost_center||null,item.entity_id||null,item.fiscal_period||null,item.fiscal_year||new Date().getFullYear(),item.standard_cost||0,item.actual_cost||0,item.variance_amount||0,item.variance_pct||0,item.material_cost||0,item.labor_cost||0,item.overhead_cost||0,item.overhead_rate||0,item.allocation_method||null,item.status||'Open']
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
      const r = await pool.query(`UPDATE erp_cost_records SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...Object.values(fields)]);
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
    const r = await pool.query(`UPDATE erp_cost_records SET status='Closed', updated_at=NOW() WHERE id = ANY($1::int[])`, [ids]);
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
        const r = await pool.query('INSERT INTO erp_cost_records (record_number,sku,standard_cost,actual_cost,fiscal_year) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (record_number) DO NOTHING RETURNING *',
          [obj.record_number, obj.sku||null, obj.standard_cost||0, obj.actual_cost||0, obj.fiscal_year||new Date().getFullYear()]);
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
    const r = await pool.query('SELECT * FROM erp_cost_records WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. POST /
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const r = await pool.query(
      'INSERT INTO erp_cost_records (record_number,cost_type,sku,item_name,cost_center,entity_id,fiscal_period,fiscal_year,standard_cost,actual_cost,variance_amount,variance_pct,material_cost,labor_cost,overhead_cost,overhead_rate,allocation_method,allocation_base,absorption_amount,volume_variance,price_variance,efficiency_variance,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *',
      [b.record_number,b.cost_type||'Standard',b.sku||null,b.item_name||null,b.cost_center||null,b.entity_id||null,b.fiscal_period||null,b.fiscal_year||new Date().getFullYear(),b.standard_cost||0,b.actual_cost||0,b.variance_amount||0,b.variance_pct||0,b.material_cost||0,b.labor_cost||0,b.overhead_cost||0,b.overhead_rate||0,b.allocation_method||null,b.allocation_base||null,b.absorption_amount||0,b.volume_variance||0,b.price_variance||0,b.efficiency_variance||0,b.status||'Open']
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
    const r = await pool.query(`UPDATE erp_cost_records SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(b)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_cost_records SET status='Closed', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. POST /:id/archive
router.post('/:id/archive', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_cost_records SET is_archived=true, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. POST /:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_cost_records SET is_archived=false, status='Open', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. GET /:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM audit_logs WHERE entity_type='erp_cost_records' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI verbs ──────────────────────────────────────────────────────────────────

router.post('/ai/suggest-overhead-rate', aiRateLimit, async (req, res) => {
  try {
    const { costCenter, allocationBase, historicalData } = req.body;
    const sys = 'You are a cost accounting expert. Suggest an optimal overhead rate.';
    const user = `Cost center: ${costCenter}, Base: ${allocationBase}, Historical: ${JSON.stringify(historicalData)}. JSON: {"recommended_rate":0,"rate_basis":"...","budget_overhead":0,"budget_base":0,"rationale":"...","comparison_to_prior_year":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-variance-root-cause', aiRateLimit, async (req, res) => {
  try {
    const { recordId } = req.body;
    const r = await pool.query('SELECT * FROM erp_cost_records WHERE id=$1', [recordId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    const sys = 'You are a variance analysis expert. Identify root causes of cost variances.';
    const user = `Cost record: ${JSON.stringify(r.rows[0])}. JSON: {"root_causes":[{"type":"price|volume|efficiency|mix","amount":0,"pct_of_total":0,"explanation":"..."}],"primary_cause":"...","corrective_actions":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-month-end-variance', aiRateLimit, async (req, res) => {
  try {
    const { costCenter, fiscalPeriod, currentActivity } = req.body;
    const history = await pool.query('SELECT * FROM erp_cost_records WHERE cost_center=$1 AND is_archived=false ORDER BY fiscal_year DESC, fiscal_period DESC LIMIT 12', [costCenter]);
    const sys = 'You are a financial forecasting expert. Predict month-end cost variance.';
    const user = `Cost center: ${costCenter}, Period: ${fiscalPeriod}, Current activity: ${JSON.stringify(currentActivity)}, History: ${JSON.stringify(history.rows)}. JSON: {"predicted_variance":0,"predicted_variance_pct":0,"confidence":"high|medium|low","key_drivers":[...],"recommended_actions":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-cost-driver', aiRateLimit, async (req, res) => {
  try {
    const { recordId } = req.body;
    const r = await pool.query('SELECT * FROM erp_cost_records WHERE id=$1', [recordId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    const sys = 'You are a cost driver analysis expert. Classify the primary cost drivers.';
    const user = `Cost record: ${JSON.stringify(r.rows[0])}. JSON: {"cost_drivers":[{"driver":"...","category":"volume|activity|structural","impact_pct":0}],"dominant_driver":"...","recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-allocation-rule', aiRateLimit, async (req, res) => {
  try {
    const { costCenter, costType, allocationBase } = req.body;
    const records = await pool.query('SELECT * FROM erp_cost_records WHERE cost_center=$1 AND is_archived=false LIMIT 20', [costCenter]);
    const sys = 'You are a cost allocation expert. Recommend the best allocation rule.';
    const user = `Cost center: ${costCenter}, Type: ${costType}, Current base: ${allocationBase}, Records: ${JSON.stringify(records.rows)}. JSON: {"recommended_method":"direct|step|reciprocal|activity-based","recommended_base":"...","rationale":"...","expected_accuracy_improvement":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-standard-cost', aiRateLimit, async (req, res) => {
  try {
    const { recordId } = req.body;
    const r = await pool.query('SELECT * FROM erp_cost_records WHERE id=$1', [recordId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    const sys = 'You are a standard costing expert. Validate the standard cost for this record.';
    const user = `Cost record: ${JSON.stringify(r.rows[0])}. JSON: {"standard_cost_valid":true|false,"issues":[...],"recommended_standard_cost":0,"variance_explanation":"...","revaluation_required":true|false}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-variance-narrative', aiRateLimit, async (req, res) => {
  try {
    const { recordId } = req.body;
    const r = await pool.query('SELECT * FROM erp_cost_records WHERE id=$1', [recordId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    const sys = 'You are a financial analyst. Generate a variance narrative for management reporting.';
    const user = `Cost record: ${JSON.stringify(r.rows[0])}. JSON: {"executive_summary":"...","detailed_analysis":"...","favorable_factors":[...],"unfavorable_factors":[...],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-cost-roll', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const records = await pool.query('SELECT sku, SUM(standard_cost) as total_std, SUM(actual_cost) as total_actual, SUM(variance_amount) as total_var FROM erp_cost_records WHERE is_archived=false GROUP BY sku ORDER BY total_var DESC LIMIT 30');
    const sys = 'You are a cost roll-up analyst. Summarize the cost roll results.';
    const user = `Cost roll data: ${JSON.stringify(records.rows)}. JSON: {"summary":"...","total_standard":0,"total_actual":0,"total_variance":0,"top_variance_items":[...],"key_findings":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-actual-vs-std', aiRateLimit, async (req, res) => {
  try {
    const { sku, period } = req.body;
    const history = await pool.query('SELECT * FROM erp_cost_records WHERE sku=$1 AND is_archived=false ORDER BY fiscal_year DESC, fiscal_period DESC LIMIT 12', [sku]);
    const sys = 'You are a cost prediction expert. Predict actual vs standard cost for next period.';
    const user = `SKU: ${sku}, Period: ${period}, History: ${JSON.stringify(history.rows)}. JSON: {"predicted_actual_cost":0,"predicted_standard_cost":0,"predicted_variance":0,"predicted_variance_pct":0,"confidence":"...","drivers":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-costing-accuracy', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const records = await pool.query('SELECT AVG(ABS(variance_pct)) as avg_abs_var, MAX(ABS(variance_pct)) as max_var, COUNT(*) FILTER (WHERE ABS(variance_pct) > 10) as high_var_count, COUNT(*) as total FROM erp_cost_records WHERE is_archived=false');
    const sys = 'You are a costing accuracy expert. Score the accuracy of the standard costing system.';
    const user = `Metrics: ${JSON.stringify(records.rows[0])}. JSON: {"accuracy_score":0-100,"grade":"A|B|C|D|F","accuracy_issues":[...],"improvement_recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-pool-redesign', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const pools = await pool.query('SELECT allocation_method, allocation_base, COUNT(*), SUM(overhead_cost) as total_overhead FROM erp_cost_records WHERE is_archived=false GROUP BY allocation_method, allocation_base');
    const sys = 'You are a cost pool design expert. Suggest cost pool redesign to improve accuracy.';
    const user = `Current pools: ${JSON.stringify(pools.rows)}. JSON: {"redesign_recommendations":[{"current_pool":"...","proposed_pool":"...","rationale":"...","expected_accuracy_improvement":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-absorption', aiRateLimit, async (req, res) => {
  try {
    const { recordId } = req.body;
    const r = await pool.query('SELECT * FROM erp_cost_records WHERE id=$1', [recordId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cost record not found' });
    const sys = 'You are a cost absorption expert. Validate the overhead absorption for this record.';
    const user = `Cost record: ${JSON.stringify(r.rows[0])}. JSON: {"absorption_valid":true|false,"over_absorbed":0,"under_absorbed":0,"absorption_rate_accuracy":"...","recommended_adjustment":0,"journal_entry":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-distorted-allocation', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const records = await pool.query('SELECT * FROM erp_cost_records WHERE is_archived=false AND overhead_cost > 0 ORDER BY variance_pct DESC LIMIT 50');
    const sys = 'You are a cost allocation accuracy expert. Detect distorted cost allocations.';
    const user = `Cost records: ${JSON.stringify(records.rows)}. JSON: {"distorted_allocations":[{"id":...,"distortion_type":"...","over_allocated":0,"under_allocated":0,"corrective_action":"..."}],"total_distortion":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-product-cost-leak', aiRateLimit, async (req, res) => {
  try {
    const { sku } = req.body;
    const records = await pool.query('SELECT * FROM erp_cost_records WHERE sku=$1 AND is_archived=false ORDER BY fiscal_year DESC, fiscal_period DESC LIMIT 12', [sku]);
    const sys = 'You are a product cost leak analyst. Identify where product costs are leaking.';
    const user = `SKU: ${sku}, History: ${JSON.stringify(records.rows)}. JSON: {"cost_leaks":[{"category":"material|labor|overhead|waste|rework","amount":0,"pct_of_total":0,"root_cause":"...","fix":"..."}],"total_leak":0,"recovery_potential":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-target-cost', aiRateLimit, async (req, res) => {
  try {
    const { sku, marketPrice, desiredMarginPct } = req.body;
    const records = await pool.query('SELECT * FROM erp_cost_records WHERE sku=$1 AND is_archived=false ORDER BY fiscal_year DESC LIMIT 6', [sku]);
    const sys = 'You are a target costing expert. Recommend target cost for this product.';
    const user = `SKU: ${sku}, Market price: ${marketPrice}, Desired margin: ${desiredMarginPct}%, History: ${JSON.stringify(records.rows)}. JSON: {"target_cost":0,"current_cost":0,"cost_gap":0,"reduction_roadmap":[{"initiative":"...","saving":0,"timeline":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/explain-margin-shift', aiRateLimit, async (req, res) => {
  try {
    const { sku, previousPeriod, currentPeriod } = req.body;
    const sys = 'You are a margin analysis expert. Explain the margin shift between periods.';
    const user = `SKU: ${sku}, Previous period: ${JSON.stringify(previousPeriod)}, Current period: ${JSON.stringify(currentPeriod)}. JSON: {"margin_shift":0,"margin_shift_pct":0,"contributors":[{"factor":"...","impact":0,"direction":"favorable|unfavorable"}],"executive_explanation":"...","recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
