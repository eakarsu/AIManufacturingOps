// ERP Feature: Inventory GL Valuation
// 18 CRUD + 16 AI verbs
// Mounted under: /api/erp/inventory-gl
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
    CREATE TABLE IF NOT EXISTS erp_inventory_gl (
      id SERIAL PRIMARY KEY,
      sku VARCHAR(100) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      item_category VARCHAR(100),
      valuation_method VARCHAR(20) DEFAULT 'WAC',
      entity_id INTEGER,
      warehouse_code VARCHAR(50),
      on_hand_qty NUMERIC(18,4) DEFAULT 0,
      unit_cost NUMERIC(18,4) DEFAULT 0,
      total_value NUMERIC(18,4) DEFAULT 0,
      cogs_ytd NUMERIC(18,4) DEFAULT 0,
      last_receipt_date DATE,
      last_issue_date DATE,
      abc_tier VARCHAR(5),
      slow_mover_flag BOOLEAN DEFAULT false,
      write_down_reserve NUMERIC(18,4) DEFAULT 0,
      reorder_point NUMERIC(18,4),
      reorder_qty NUMERIC(18,4),
      gl_inventory_account INTEGER,
      gl_cogs_account INTEGER,
      currency_code VARCHAR(10) DEFAULT 'USD',
      is_active BOOLEAN DEFAULT true,
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
    if (req.query.valuation_method) { params.push(req.query.valuation_method); where.push(`valuation_method=$${params.length}`); }
    if (req.query.abc_tier) { params.push(req.query.abc_tier); where.push(`abc_tier=$${params.length}`); }
    const wc = `WHERE ${where.join(' AND ')}`;
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_inventory_gl ${wc}`, params);
    const total = parseInt(cnt.rows[0].count);
    params.push(limit); params.push(offset);
    const rows = await pool.query(`SELECT * FROM erp_inventory_gl ${wc} ORDER BY sku ASC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. GET /count
router.get('/count', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('SELECT COUNT(*) FROM erp_inventory_gl WHERE is_archived=false');
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
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_inventory_gl WHERE (sku ILIKE $1 OR item_name ILIKE $1 OR item_category ILIKE $1) AND is_archived=false`, [q]);
    const total = parseInt(cnt.rows[0].count);
    const rows = await pool.query(`SELECT * FROM erp_inventory_gl WHERE (sku ILIKE $1 OR item_name ILIKE $1 OR item_category ILIKE $1) AND is_archived=false ORDER BY sku ASC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET /by-warehouse/:warehouseCode
router.get('/by-warehouse/:warehouseCode', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_inventory_gl WHERE warehouse_code=$1 AND is_archived=false ORDER BY sku', [req.params.warehouseCode]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GET /by-category/:category
router.get('/by-category/:category', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_inventory_gl WHERE item_category=$1 AND is_archived=false ORDER BY sku', [req.params.category]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. GET /export/csv
router.get('/export/csv', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_inventory_gl ORDER BY sku');
    const fields = ['id','sku','item_name','item_category','valuation_method','entity_id','warehouse_code','on_hand_qty','unit_cost','total_value','cogs_ytd','abc_tier','slow_mover_flag','write_down_reserve','reorder_point','reorder_qty','currency_code','is_active','created_at','updated_at'];
    const header = fields.join(',');
    const csv = [header, ...rows.rows.map(r => fields.map(f => `"${String(r[f]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_gl.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. GET /stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    await ensureTable();
    const [byMethod, byAbc, totals] = await Promise.all([
      pool.query('SELECT valuation_method, COUNT(*), SUM(total_value) as total_val FROM erp_inventory_gl WHERE is_archived=false GROUP BY valuation_method'),
      pool.query('SELECT abc_tier, COUNT(*), SUM(total_value) as total_val FROM erp_inventory_gl WHERE is_archived=false GROUP BY abc_tier'),
      pool.query('SELECT SUM(total_value) as inventory_total, SUM(cogs_ytd) as cogs_total, COUNT(*) FILTER (WHERE slow_mover_flag=true) as slow_movers FROM erp_inventory_gl WHERE is_archived=false')
    ]);
    res.json({ byValuationMethod: byMethod.rows, byAbcTier: byAbc.rows, totals: totals.rows[0] });
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
        'INSERT INTO erp_inventory_gl (sku,item_name,item_category,valuation_method,entity_id,warehouse_code,on_hand_qty,unit_cost,total_value,abc_tier,reorder_point,reorder_qty,currency_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
        [item.sku,item.item_name,item.item_category||null,item.valuation_method||'WAC',item.entity_id||null,item.warehouse_code||null,item.on_hand_qty||0,item.unit_cost||0,item.total_value||0,item.abc_tier||null,item.reorder_point||null,item.reorder_qty||null,item.currency_code||'USD']
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
      const r = await pool.query(`UPDATE erp_inventory_gl SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...Object.values(fields)]);
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
    const r = await pool.query(`UPDATE erp_inventory_gl SET is_active=false, updated_at=NOW() WHERE id = ANY($1::int[])`, [ids]);
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
        const r = await pool.query(
          'INSERT INTO erp_inventory_gl (sku,item_name,on_hand_qty,unit_cost,total_value) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [obj.sku, obj.item_name, obj.on_hand_qty||0, obj.unit_cost||0, obj.total_value||0]
        );
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
    const r = await pool.query('SELECT * FROM erp_inventory_gl WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Inventory item not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. POST /
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const r = await pool.query(
      'INSERT INTO erp_inventory_gl (sku,item_name,item_category,valuation_method,entity_id,warehouse_code,on_hand_qty,unit_cost,total_value,abc_tier,reorder_point,reorder_qty,currency_code,gl_inventory_account,gl_cogs_account) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
      [b.sku,b.item_name,b.item_category||null,b.valuation_method||'WAC',b.entity_id||null,b.warehouse_code||null,b.on_hand_qty||0,b.unit_cost||0,b.total_value||0,b.abc_tier||null,b.reorder_point||null,b.reorder_qty||null,b.currency_code||'USD',b.gl_inventory_account||null,b.gl_cogs_account||null]
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
    const r = await pool.query(`UPDATE erp_inventory_gl SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(b)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Inventory item not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_inventory_gl SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Inventory item not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. POST /:id/archive
router.post('/:id/archive', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_inventory_gl SET is_archived=true, is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Inventory item not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. POST /:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_inventory_gl SET is_archived=false, is_active=true, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Inventory item not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. GET /:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM audit_logs WHERE entity_type='erp_inventory_gl' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI verbs ──────────────────────────────────────────────────────────────────

router.post('/ai/suggest-valuation-method', aiRateLimit, async (req, res) => {
  try {
    const { itemId } = req.body;
    const r = await pool.query('SELECT * FROM erp_inventory_gl WHERE id=$1', [itemId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const sys = 'You are an inventory accounting expert. Recommend the optimal inventory valuation method.';
    const user = `Item: ${JSON.stringify(r.rows[0])}. JSON: {"recommended_method":"FIFO|LIFO|WAC","rationale":"...","financial_impact":"...","tax_implications":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-cogs-discrepancy', aiRateLimit, async (req, res) => {
  try {
    const { itemId, expectedCogs } = req.body;
    const r = await pool.query('SELECT * FROM erp_inventory_gl WHERE id=$1', [itemId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const sys = 'You are a cost accounting expert. Detect COGS discrepancies.';
    const user = `Item: ${JSON.stringify(r.rows[0])}, Expected COGS: ${expectedCogs}. JSON: {"discrepancy_found":true|false,"variance_amount":0,"variance_pct":0,"root_cause":"...","recommended_adjustment":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-slow-mover', aiRateLimit, async (req, res) => {
  try {
    const { itemId } = req.body;
    const r = await pool.query('SELECT * FROM erp_inventory_gl WHERE id=$1', [itemId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const sys = 'You are an inventory analyst. Classify whether this item is a slow mover.';
    const user = `Item: ${JSON.stringify(r.rows[0])}, Today: ${new Date().toISOString().split('T')[0]}. JSON: {"is_slow_mover":true|false,"classification":"Fast|Normal|Slow|Dead","days_since_last_movement":0,"recommended_action":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-write-down', aiRateLimit, async (req, res) => {
  try {
    const { itemId } = req.body;
    const r = await pool.query('SELECT * FROM erp_inventory_gl WHERE id=$1', [itemId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const sys = 'You are an inventory impairment expert. Predict if this item needs a write-down.';
    const user = `Item: ${JSON.stringify(r.rows[0])}. JSON: {"write_down_required":true|false,"recommended_write_down_amount":0,"net_realizable_value":0,"rationale":"...","urgency":"immediate|next_period|monitor"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-cycle-count', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const items = await pool.query('SELECT id, sku, item_name, total_value, abc_tier, last_receipt_date FROM erp_inventory_gl WHERE is_archived=false ORDER BY total_value DESC LIMIT 50');
    const sys = 'You are an inventory control expert. Recommend a cycle counting schedule.';
    const user = `Items: ${JSON.stringify(items.rows)}. JSON: {"cycle_count_plan":[{"sku":"...","priority":"weekly|monthly|quarterly|annual","rationale":"...","estimated_count_time_hrs":0}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-inventory-cutoff', aiRateLimit, async (req, res) => {
  try {
    const { periodEndDate, itemIds } = req.body;
    const items = await pool.query('SELECT * FROM erp_inventory_gl WHERE id = ANY($1::int[])', [itemIds||[]]);
    const sys = 'You are an audit expert. Validate inventory cutoff as of period end.';
    const user = `Period end: ${periodEndDate}, Items: ${JSON.stringify(items.rows)}. JSON: {"cutoff_issues":[{"item_id":...,"sku":"...","issue":"...","impact":0}],"overall_status":"clean|issues_found","recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-reserve-recommendation', aiRateLimit, async (req, res) => {
  try {
    const slow = await pool.query('SELECT * FROM erp_inventory_gl WHERE slow_mover_flag=true AND is_archived=false');
    const sys = 'You are an inventory reserve expert. Recommend inventory write-down reserves.';
    const user = `Slow movers: ${JSON.stringify(slow.rows)}. JSON: {"total_recommended_reserve":0,"reserve_by_item":[{"id":...,"sku":"...","recommended_reserve":0,"reserve_pct":0,"reason":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-shrinkage', aiRateLimit, async (req, res) => {
  try {
    const { itemId, systemQty, physicalQty } = req.body;
    const r = await pool.query('SELECT * FROM erp_inventory_gl WHERE id=$1', [itemId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const sys = 'You are an inventory shrinkage detection expert.';
    const user = `Item: ${JSON.stringify(r.rows[0])}, System qty: ${systemQty}, Physical qty: ${physicalQty}. JSON: {"shrinkage_detected":true|false,"shrinkage_qty":0,"shrinkage_value":0,"shrinkage_pct":0,"likely_cause":"theft|damage|counting_error|process_issue","recommended_action":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-reorder-point', aiRateLimit, async (req, res) => {
  try {
    const { itemId, demandHistory, leadTimeDays } = req.body;
    const r = await pool.query('SELECT * FROM erp_inventory_gl WHERE id=$1', [itemId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const sys = 'You are an inventory optimization expert. Calculate optimal reorder point.';
    const user = `Item: ${JSON.stringify(r.rows[0])}, Demand history: ${JSON.stringify(demandHistory)}, Lead time: ${leadTimeDays} days. JSON: {"suggested_reorder_point":0,"safety_stock":0,"average_daily_demand":0,"rationale":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-on-hand-changes', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const items = await pool.query('SELECT sku, item_name, on_hand_qty, total_value, abc_tier, last_receipt_date, last_issue_date FROM erp_inventory_gl WHERE is_archived=false ORDER BY total_value DESC LIMIT 50');
    const sys = 'You are an inventory analyst. Summarize on-hand inventory changes.';
    const user = `Current inventory: ${JSON.stringify(items.rows)}. JSON: {"summary":"...","total_value":0,"top_movers":[...],"key_observations":[...],"action_items":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-stockout', aiRateLimit, async (req, res) => {
  try {
    const { itemId, demandForecast } = req.body;
    const r = await pool.query('SELECT * FROM erp_inventory_gl WHERE id=$1', [itemId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const sys = 'You are a supply chain expert. Predict stockout risk.';
    const user = `Item: ${JSON.stringify(r.rows[0])}, Demand forecast: ${JSON.stringify(demandForecast)}. JSON: {"stockout_risk":"low|medium|high|critical","days_to_stockout":0,"stockout_date":"YYYY-MM-DD","recommended_replenishment_qty":0,"urgency":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-abc-tier', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const items = await pool.query('SELECT id, sku, item_name, total_value, cogs_ytd FROM erp_inventory_gl WHERE is_archived=false ORDER BY total_value DESC LIMIT 200');
    const sys = 'You are an inventory ABC analysis expert. Classify items into A, B, C tiers.';
    const user = `Items: ${JSON.stringify(items.rows)}. JSON: {"classifications":[{"id":...,"sku":"...","tier":"A|B|C","value_pct":0,"rationale":"..."}],"a_count":0,"b_count":0,"c_count":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-costing-run', aiRateLimit, async (req, res) => {
  try {
    const { itemIds } = req.body;
    const items = await pool.query('SELECT * FROM erp_inventory_gl WHERE id = ANY($1::int[])', [itemIds||[]]);
    const sys = 'You are a cost accounting expert. Validate the inventory costing run results.';
    const user = `Items: ${JSON.stringify(items.rows)}. JSON: {"validation_status":"passed|failed|warnings","issues":[{"item_id":...,"issue":"...","severity":"..."}],"total_valuation":0,"recommended_adjustments":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-revaluation', aiRateLimit, async (req, res) => {
  try {
    const { itemId, marketPrice } = req.body;
    const r = await pool.query('SELECT * FROM erp_inventory_gl WHERE id=$1', [itemId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Item not found' });
    const sys = 'You are an inventory revaluation expert.';
    const user = `Item: ${JSON.stringify(r.rows[0])}, Current market price: ${marketPrice}. JSON: {"revaluation_required":true|false,"revaluation_amount":0,"revaluation_direction":"up|down|none","accounting_treatment":"...","gl_impact":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-negative-on-hand', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const neg = await pool.query('SELECT * FROM erp_inventory_gl WHERE on_hand_qty < 0 AND is_archived=false');
    const sys = 'You are an inventory data quality expert. Diagnose negative on-hand quantity situations.';
    const user = `Items with negative qty: ${JSON.stringify(neg.rows)}. JSON: {"negative_items_count":${neg.rows.length},"root_causes":[...],"recommended_corrections":[{"item_id":...,"action":"...","priority":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-inventory-quality', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const [total, negQty, noAbc, noReorder] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM erp_inventory_gl WHERE is_archived=false'),
      pool.query('SELECT COUNT(*) FROM erp_inventory_gl WHERE on_hand_qty < 0 AND is_archived=false'),
      pool.query('SELECT COUNT(*) FROM erp_inventory_gl WHERE abc_tier IS NULL AND is_archived=false'),
      pool.query('SELECT COUNT(*) FROM erp_inventory_gl WHERE reorder_point IS NULL AND is_archived=false')
    ]);
    const sys = 'You are an inventory data quality expert. Score the overall inventory data quality.';
    const user = `Stats: total=${total.rows[0].count}, negative_qty=${negQty.rows[0].count}, no_abc_tier=${noAbc.rows[0].count}, no_reorder_point=${noReorder.rows[0].count}. JSON: {"quality_score":0-100,"grade":"A|B|C|D|F","issues":[{"issue":"...","count":0,"severity":"..."}],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
