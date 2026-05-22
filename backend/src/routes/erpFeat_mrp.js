// ERP Feature: Material Requirements Planning (MRP)
// 18 CRUD + 16 AI verbs
// Mounted under: /api/erp/mrp
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
    CREATE TABLE IF NOT EXISTS erp_mrp_orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(100) UNIQUE NOT NULL,
      order_type VARCHAR(30) DEFAULT 'Planned',
      sku VARCHAR(100) NOT NULL,
      item_name VARCHAR(255),
      demand_qty NUMERIC(18,4) DEFAULT 0,
      supply_qty NUMERIC(18,4) DEFAULT 0,
      on_hand_qty NUMERIC(18,4) DEFAULT 0,
      net_requirement NUMERIC(18,4) DEFAULT 0,
      planned_start_date DATE,
      planned_end_date DATE,
      required_date DATE,
      lead_time_days INTEGER DEFAULT 0,
      supplier_id INTEGER,
      bom_id INTEGER,
      safety_stock NUMERIC(18,4) DEFAULT 0,
      action_message VARCHAR(100),
      shortage_flag BOOLEAN DEFAULT false,
      entity_id INTEGER,
      status VARCHAR(50) DEFAULT 'Open',
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
    if (req.query.shortage_flag === 'true') { where.push(`shortage_flag=true`); }
    const wc = `WHERE ${where.join(' AND ')}`;
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_mrp_orders ${wc}`, params);
    const total = parseInt(cnt.rows[0].count);
    params.push(limit); params.push(offset);
    const rows = await pool.query(`SELECT * FROM erp_mrp_orders ${wc} ORDER BY required_date ASC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. GET /count
router.get('/count', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('SELECT COUNT(*) FROM erp_mrp_orders WHERE is_archived=false');
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
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_mrp_orders WHERE (order_number ILIKE $1 OR sku ILIKE $1 OR item_name ILIKE $1) AND is_archived=false`, [q]);
    const total = parseInt(cnt.rows[0].count);
    const rows = await pool.query(`SELECT * FROM erp_mrp_orders WHERE (order_number ILIKE $1 OR sku ILIKE $1 OR item_name ILIKE $1) AND is_archived=false ORDER BY required_date ASC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET /by-sku/:sku
router.get('/by-sku/:sku', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_mrp_orders WHERE sku=$1 AND is_archived=false ORDER BY required_date', [req.params.sku]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GET /by-supplier/:supplierId
router.get('/by-supplier/:supplierId', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_mrp_orders WHERE supplier_id=$1 AND is_archived=false ORDER BY required_date', [req.params.supplierId]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. GET /export/csv
router.get('/export/csv', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_mrp_orders ORDER BY required_date');
    const fields = ['id','order_number','order_type','sku','item_name','demand_qty','supply_qty','on_hand_qty','net_requirement','planned_start_date','planned_end_date','required_date','lead_time_days','supplier_id','bom_id','safety_stock','action_message','shortage_flag','entity_id','status','created_at'];
    const header = fields.join(',');
    const csv = [header, ...rows.rows.map(r => fields.map(f => `"${String(r[f]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="mrp_orders.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. GET /stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    await ensureTable();
    const [byStatus, shortages, actions] = await Promise.all([
      pool.query('SELECT status, COUNT(*) FROM erp_mrp_orders WHERE is_archived=false GROUP BY status'),
      pool.query('SELECT COUNT(*) FROM erp_mrp_orders WHERE shortage_flag=true AND is_archived=false'),
      pool.query('SELECT action_message, COUNT(*) FROM erp_mrp_orders WHERE is_archived=false GROUP BY action_message')
    ]);
    res.json({ byStatus: byStatus.rows, shortageCount: parseInt(shortages.rows[0].count), byActionMessage: actions.rows });
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
        'INSERT INTO erp_mrp_orders (order_number,order_type,sku,item_name,demand_qty,supply_qty,on_hand_qty,net_requirement,planned_start_date,planned_end_date,required_date,lead_time_days,supplier_id,bom_id,safety_stock,action_message,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',
        [item.order_number,item.order_type||'Planned',item.sku,item.item_name||null,item.demand_qty||0,item.supply_qty||0,item.on_hand_qty||0,item.net_requirement||0,item.planned_start_date||null,item.planned_end_date||null,item.required_date||null,item.lead_time_days||0,item.supplier_id||null,item.bom_id||null,item.safety_stock||0,item.action_message||null,item.status||'Open']
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
      const r = await pool.query(`UPDATE erp_mrp_orders SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...Object.values(fields)]);
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
    const r = await pool.query(`UPDATE erp_mrp_orders SET status='Cancelled', updated_at=NOW() WHERE id = ANY($1::int[])`, [ids]);
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
        const r = await pool.query('INSERT INTO erp_mrp_orders (order_number,sku,demand_qty,required_date) VALUES ($1,$2,$3,$4) ON CONFLICT (order_number) DO NOTHING RETURNING *',
          [obj.order_number, obj.sku, obj.demand_qty||0, obj.required_date||null]);
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
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. POST /
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const r = await pool.query(
      'INSERT INTO erp_mrp_orders (order_number,order_type,sku,item_name,demand_qty,supply_qty,on_hand_qty,net_requirement,planned_start_date,planned_end_date,required_date,lead_time_days,supplier_id,bom_id,safety_stock,action_message,entity_id,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *',
      [b.order_number,b.order_type||'Planned',b.sku,b.item_name||null,b.demand_qty||0,b.supply_qty||0,b.on_hand_qty||0,b.net_requirement||0,b.planned_start_date||null,b.planned_end_date||null,b.required_date||null,b.lead_time_days||0,b.supplier_id||null,b.bom_id||null,b.safety_stock||0,b.action_message||null,b.entity_id||null,b.status||'Open']
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
    const r = await pool.query(`UPDATE erp_mrp_orders SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(b)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_mrp_orders SET status='Cancelled', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. POST /:id/archive
router.post('/:id/archive', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_mrp_orders SET is_archived=true, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. POST /:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_mrp_orders SET is_archived=false, status='Open', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. GET /:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM audit_logs WHERE entity_type='erp_mrp_orders' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI verbs ──────────────────────────────────────────────────────────────────

router.post('/ai/predict-demand', aiRateLimit, async (req, res) => {
  try {
    const { sku, historicalDemand, horizon } = req.body;
    const sys = 'You are a demand planning expert. Predict future demand for this SKU.';
    const user = `SKU: ${sku}, Historical demand: ${JSON.stringify(historicalDemand)}, Horizon: ${horizon||'30 days'}. JSON: {"predicted_demand_by_period":[{"period":"...","qty":0}],"forecast_method":"...","accuracy_estimate":"...","key_drivers":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-safety-stock', aiRateLimit, async (req, res) => {
  try {
    const { orderId } = req.body;
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [orderId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    const sys = 'You are a supply chain expert. Recommend safety stock levels.';
    const user = `MRP order: ${JSON.stringify(r.rows[0])}. JSON: {"recommended_safety_stock":0,"calculation_method":"...","service_level_pct":0,"rationale":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-supply-gap', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const orders = await pool.query('SELECT * FROM erp_mrp_orders WHERE is_archived=false AND status=\'Open\' ORDER BY required_date ASC LIMIT 50');
    const sys = 'You are an MRP analyst. Detect supply gaps in the planning horizon.';
    const user = `MRP orders: ${JSON.stringify(orders.rows)}. JSON: {"gaps":[{"sku":"...","gap_qty":0,"gap_start_date":"...","gap_end_date":"...","severity":"critical|high|medium|low","suggested_action":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-shortage-cause', aiRateLimit, async (req, res) => {
  try {
    const { orderId } = req.body;
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [orderId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    const sys = 'You are an MRP analyst. Classify the root cause of this material shortage.';
    const user = `MRP order: ${JSON.stringify(r.rows[0])}. JSON: {"shortage_cause":"demand_spike|supplier_delay|forecast_error|capacity_constraint|data_error|other","confidence":"high|medium|low","corrective_actions":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-expedite', aiRateLimit, async (req, res) => {
  try {
    const { orderId } = req.body;
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [orderId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    const sys = 'You are a supply chain expediter. Determine if this order should be expedited.';
    const user = `MRP order: ${JSON.stringify(r.rows[0])}. JSON: {"expedite_recommended":true|false,"urgency":"critical|high|medium|low","recommended_new_date":"YYYY-MM-DD","expedite_cost_estimate":"...","alternatives":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-planned-order', aiRateLimit, async (req, res) => {
  try {
    const { sku, demandQty, requiredDate, bomId, supplierId } = req.body;
    const sys = 'You are an MRP system. Generate a planned order recommendation.';
    const user = `SKU: ${sku}, Demand qty: ${demandQty}, Required by: ${requiredDate}, BOM: ${bomId}, Supplier: ${supplierId}. JSON: {"order_number":"MRP-XXXX","planned_start_date":"YYYY-MM-DD","planned_end_date":"YYYY-MM-DD","planned_qty":0,"lead_time_days":0,"components_needed":[{"sku":"...","qty":0}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-mrp-run', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const [orders, shortages, actions] = await Promise.all([
      pool.query('SELECT COUNT(*), SUM(demand_qty) as total_demand FROM erp_mrp_orders WHERE is_archived=false'),
      pool.query('SELECT COUNT(*) FROM erp_mrp_orders WHERE shortage_flag=true AND is_archived=false'),
      pool.query('SELECT action_message, COUNT(*) FROM erp_mrp_orders WHERE is_archived=false GROUP BY action_message')
    ]);
    const sys = 'You are an MRP analyst. Summarize the MRP run results.';
    const user = `Orders: ${JSON.stringify(orders.rows[0])}, Shortages: ${shortages.rows[0].count}, Actions: ${JSON.stringify(actions.rows)}. JSON: {"summary":"...","total_orders":0,"shortage_count":0,"key_issues":[...],"recommended_next_steps":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-late-delivery', aiRateLimit, async (req, res) => {
  try {
    const { orderId } = req.body;
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [orderId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    const sys = 'You are a supply chain risk analyst. Predict late delivery risk.';
    const user = `MRP order: ${JSON.stringify(r.rows[0])}, Today: ${new Date().toISOString().split('T')[0]}. JSON: {"late_delivery_risk":"low|medium|high|critical","probability_on_time":0-100,"predicted_delivery_date":"YYYY-MM-DD","delay_days":0,"risk_factors":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-alternate-bom', aiRateLimit, async (req, res) => {
  try {
    const { orderId, shortageSkus } = req.body;
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [orderId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    const sys = 'You are a manufacturing engineer. Suggest alternate BOM to resolve material shortage.';
    const user = `MRP order: ${JSON.stringify(r.rows[0])}, Short SKUs: ${JSON.stringify(shortageSkus)}. JSON: {"alternate_bom_options":[{"description":"...","substitute_components":[{"original_sku":"...","substitute_sku":"...","qty_factor":1}],"feasibility":"...","quality_impact":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-mrp-stability', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const [total, short, cancelled, rescheduled] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM erp_mrp_orders WHERE is_archived=false'),
      pool.query('SELECT COUNT(*) FROM erp_mrp_orders WHERE shortage_flag=true AND is_archived=false'),
      pool.query(`SELECT COUNT(*) FROM erp_mrp_orders WHERE status='Cancelled' AND is_archived=false`),
      pool.query(`SELECT COUNT(*) FROM erp_mrp_orders WHERE action_message ILIKE '%reschedule%' AND is_archived=false`)
    ]);
    const sys = 'You are an MRP stability analyst. Score the stability of the MRP plan.';
    const user = `Total=${total.rows[0].count}, Shortages=${short.rows[0].count}, Cancelled=${cancelled.rows[0].count}, Rescheduled=${rescheduled.rows[0].count}. JSON: {"stability_score":0-100,"grade":"A|B|C|D|F","instability_drivers":[...],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-pegging-conflict', aiRateLimit, async (req, res) => {
  try {
    const { sku } = req.body;
    const orders = await pool.query('SELECT * FROM erp_mrp_orders WHERE sku=$1 AND is_archived=false ORDER BY required_date', [sku]);
    const sys = 'You are an MRP pegging expert. Detect conflicts in demand-supply pegging.';
    const user = `Orders for SKU ${sku}: ${JSON.stringify(orders.rows)}. JSON: {"conflicts":[{"demand_order":"...","supply_order":"...","conflict_type":"...","qty_mismatch":0,"date_mismatch_days":0}],"resolution_options":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-action-message', aiRateLimit, async (req, res) => {
  try {
    const { orderId } = req.body;
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [orderId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    const sys = 'You are an MRP analyst. Classify and prioritize the action message for this order.';
    const user = `MRP order: ${JSON.stringify(r.rows[0])}. JSON: {"action_category":"Release|Expedite|Reschedule|Cancel|Split|Merge","priority":"1-5","business_impact":"...","recommended_action":"...","due_date":"YYYY-MM-DD"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-lead-time', aiRateLimit, async (req, res) => {
  try {
    const { orderId } = req.body;
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [orderId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    const sys = 'You are a supply chain expert. Validate the lead time configuration for this MRP order.';
    const user = `MRP order: ${JSON.stringify(r.rows[0])}. JSON: {"lead_time_valid":true|false,"expected_lead_time_days":0,"variance_days":0,"issues":[...],"recommended_lead_time_days":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-supplier-shift', aiRateLimit, async (req, res) => {
  try {
    const { orderId } = req.body;
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [orderId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    const sys = 'You are a strategic sourcing expert. Recommend if supplier shift is warranted.';
    const user = `MRP order: ${JSON.stringify(r.rows[0])}. JSON: {"shift_recommended":true|false,"current_supplier_risk":"...","alternative_suppliers":[{"name":"...","estimated_lead_time":0,"risk_level":"..."}],"transition_plan":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-component-shortage', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const shortOrders = await pool.query('SELECT * FROM erp_mrp_orders WHERE shortage_flag=true AND is_archived=false ORDER BY required_date ASC LIMIT 20');
    const sys = 'You are a supply chain risk expert. Predict upcoming component shortages.';
    const user = `Current shortages: ${JSON.stringify(shortOrders.rows)}. JSON: {"predicted_shortages":[{"sku":"...","shortage_qty":0,"expected_date":"YYYY-MM-DD","confidence":"...","mitigation":"..."}],"summary":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-resource-shift', aiRateLimit, async (req, res) => {
  try {
    const { orderId } = req.body;
    const r = await pool.query('SELECT * FROM erp_mrp_orders WHERE id=$1', [orderId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'MRP order not found' });
    const sys = 'You are a production planning expert. Suggest resource shifts to meet this MRP order.';
    const user = `MRP order: ${JSON.stringify(r.rows[0])}. JSON: {"resource_shifts":[{"resource_type":"capacity|labor|material","from":"...","to":"...","quantity":0,"feasibility":"..."}],"implementation_steps":[...],"risk":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
