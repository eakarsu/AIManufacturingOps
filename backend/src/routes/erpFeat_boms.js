// ERP Feature: Bills of Materials (BOMs)
// 18 CRUD + 16 AI verbs
// Mounted under: /api/erp/boms
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
    CREATE TABLE IF NOT EXISTS erp_boms (
      id SERIAL PRIMARY KEY,
      bom_number VARCHAR(100) UNIQUE NOT NULL,
      parent_sku VARCHAR(100) NOT NULL,
      parent_name VARCHAR(255),
      revision VARCHAR(20) DEFAULT '1.0',
      revision_date DATE,
      status VARCHAR(30) DEFAULT 'Active',
      bom_type VARCHAR(30) DEFAULT 'Manufacturing',
      entity_id INTEGER,
      component_count INTEGER DEFAULT 0,
      routing_steps INTEGER DEFAULT 0,
      standard_cost NUMERIC(18,4) DEFAULT 0,
      make_vs_buy VARCHAR(20) DEFAULT 'Make',
      yield_pct NUMERIC(5,2) DEFAULT 100,
      phantom_bom BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      is_archived BOOLEAN DEFAULT false,
      components JSONB,
      routings JSONB,
      engineering_change_order VARCHAR(100),
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
    if (req.query.make_vs_buy) { params.push(req.query.make_vs_buy); where.push(`make_vs_buy=$${params.length}`); }
    const wc = `WHERE ${where.join(' AND ')}`;
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_boms ${wc}`, params);
    const total = parseInt(cnt.rows[0].count);
    params.push(limit); params.push(offset);
    const rows = await pool.query(`SELECT * FROM erp_boms ${wc} ORDER BY bom_number ASC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. GET /count
router.get('/count', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('SELECT COUNT(*) FROM erp_boms WHERE is_archived=false');
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
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_boms WHERE (bom_number ILIKE $1 OR parent_sku ILIKE $1 OR parent_name ILIKE $1) AND is_archived=false`, [q]);
    const total = parseInt(cnt.rows[0].count);
    const rows = await pool.query(`SELECT * FROM erp_boms WHERE (bom_number ILIKE $1 OR parent_sku ILIKE $1 OR parent_name ILIKE $1) AND is_archived=false ORDER BY bom_number ASC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET /by-sku/:parentSku
router.get('/by-sku/:parentSku', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_boms WHERE parent_sku=$1 AND is_archived=false ORDER BY revision DESC', [req.params.parentSku]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GET /by-type/:bomType
router.get('/by-type/:bomType', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_boms WHERE bom_type=$1 AND is_archived=false ORDER BY bom_number', [req.params.bomType]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. GET /export/csv
router.get('/export/csv', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT id,bom_number,parent_sku,parent_name,revision,revision_date,status,bom_type,component_count,routing_steps,standard_cost,make_vs_buy,yield_pct,phantom_bom,is_active,engineering_change_order,created_at,updated_at FROM erp_boms ORDER BY bom_number');
    const fields = ['id','bom_number','parent_sku','parent_name','revision','revision_date','status','bom_type','component_count','routing_steps','standard_cost','make_vs_buy','yield_pct','phantom_bom','is_active','engineering_change_order','created_at','updated_at'];
    const header = fields.join(',');
    const csv = [header, ...rows.rows.map(r => fields.map(f => `"${String(r[f]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="boms.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. GET /stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    await ensureTable();
    const [byStatus, byMvb, totals] = await Promise.all([
      pool.query('SELECT status, COUNT(*) FROM erp_boms WHERE is_archived=false GROUP BY status'),
      pool.query('SELECT make_vs_buy, COUNT(*) FROM erp_boms WHERE is_archived=false GROUP BY make_vs_buy'),
      pool.query('SELECT COUNT(*) FILTER (WHERE phantom_bom=true) as phantom_count, AVG(yield_pct) as avg_yield, AVG(standard_cost) as avg_cost FROM erp_boms WHERE is_archived=false')
    ]);
    res.json({ byStatus: byStatus.rows, byMakeVsBuy: byMvb.rows, totals: totals.rows[0] });
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
        'INSERT INTO erp_boms (bom_number,parent_sku,parent_name,revision,revision_date,status,bom_type,entity_id,standard_cost,make_vs_buy,yield_pct,phantom_bom,components,routings) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
        [item.bom_number,item.parent_sku,item.parent_name||null,item.revision||'1.0',item.revision_date||null,item.status||'Active',item.bom_type||'Manufacturing',item.entity_id||null,item.standard_cost||0,item.make_vs_buy||'Make',item.yield_pct||100,item.phantom_bom||false,item.components?JSON.stringify(item.components):null,item.routings?JSON.stringify(item.routings):null]
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
      const r = await pool.query(`UPDATE erp_boms SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...Object.values(fields)]);
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
    const r = await pool.query(`UPDATE erp_boms SET is_active=false, updated_at=NOW() WHERE id = ANY($1::int[])`, [ids]);
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
        const r = await pool.query('INSERT INTO erp_boms (bom_number,parent_sku,parent_name,revision) VALUES ($1,$2,$3,$4) ON CONFLICT (bom_number) DO NOTHING RETURNING *',
          [obj.bom_number, obj.parent_sku, obj.parent_name||null, obj.revision||'1.0']);
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
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. POST /
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const r = await pool.query(
      'INSERT INTO erp_boms (bom_number,parent_sku,parent_name,revision,revision_date,status,bom_type,entity_id,standard_cost,make_vs_buy,yield_pct,phantom_bom,components,routings,engineering_change_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
      [b.bom_number,b.parent_sku,b.parent_name||null,b.revision||'1.0',b.revision_date||null,b.status||'Active',b.bom_type||'Manufacturing',b.entity_id||null,b.standard_cost||0,b.make_vs_buy||'Make',b.yield_pct||100,b.phantom_bom||false,b.components?JSON.stringify(b.components):null,b.routings?JSON.stringify(b.routings):null,b.engineering_change_order||null]
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
    const r = await pool.query(`UPDATE erp_boms SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(b)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_boms SET is_active=false, status='Inactive', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. POST /:id/archive
router.post('/:id/archive', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_boms SET is_archived=true, is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. POST /:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_boms SET is_archived=false, is_active=true, status='Active', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. GET /:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM audit_logs WHERE entity_type='erp_boms' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI verbs ──────────────────────────────────────────────────────────────────

router.post('/ai/detect-bom-circularity', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const boms = await pool.query('SELECT id, bom_number, parent_sku, components FROM erp_boms WHERE is_archived=false LIMIT 100');
    const sys = 'You are a BOM data integrity expert. Detect circular references in the BOM structure.';
    const user = `BOMs: ${JSON.stringify(boms.rows)}. JSON: {"circular_references":[{"bom_id":...,"parent_sku":"...","cycle":[...],"severity":"..."}],"summary":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-component-substitute', aiRateLimit, async (req, res) => {
  try {
    const { bomId, componentSku, shortageReason } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a manufacturing engineer. Suggest component substitutes for BOM components.';
    const user = `BOM: ${JSON.stringify(r.rows[0])}, Component SKU: ${componentSku}, Shortage reason: ${shortageReason}. JSON: {"substitutes":[{"sku":"...","name":"...","compatibility":"full|partial","yield_adjustment":1.0,"cost_delta_pct":0,"qualification_required":true|false,"lead_time_days":0}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-bom-cost', aiRateLimit, async (req, res) => {
  try {
    const { bomId } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a cost engineering expert. Predict the total cost of this BOM.';
    const user = `BOM: ${JSON.stringify(r.rows[0])}. JSON: {"predicted_material_cost":0,"predicted_labor_cost":0,"predicted_overhead_cost":0,"predicted_total_cost":0,"confidence":"high|medium|low","cost_drivers":[...],"cost_reduction_opportunities":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-bom-revision-impact', aiRateLimit, async (req, res) => {
  try {
    const { bomId, changedComponents } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are an engineering change management expert. Classify the impact of a BOM revision.';
    const user = `BOM: ${JSON.stringify(r.rows[0])}, Changed components: ${JSON.stringify(changedComponents)}. JSON: {"impact_level":"major|minor|cosmetic","cost_impact":0,"quality_impact":"...","supply_chain_impact":"...","required_approvals":[...],"effectivity_recommendation":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-routing-steps', aiRateLimit, async (req, res) => {
  try {
    const { bomId } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a manufacturing process engineer. Validate the routing steps for this BOM.';
    const user = `BOM routings: ${JSON.stringify(r.rows[0].routings)}. JSON: {"valid":true|false,"issues":[{"step":...,"issue":"...","severity":"..."}],"missing_steps":[...],"redundant_steps":[...],"optimization_suggestions":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-bom-narrative', aiRateLimit, async (req, res) => {
  try {
    const { bomId } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a technical writer. Generate a human-readable narrative of this BOM.';
    const user = `BOM: ${JSON.stringify(r.rows[0])}. JSON: {"narrative":"...","key_components_description":"...","manufacturing_process_summary":"...","quality_considerations":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-orphan-components', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const boms = await pool.query('SELECT id, bom_number, parent_sku, components FROM erp_boms WHERE is_archived=false LIMIT 100');
    const sys = 'You are a BOM data quality expert. Detect orphan components not used in any active BOM.';
    const user = `BOMs: ${JSON.stringify(boms.rows)}. JSON: {"orphan_components":[{"sku":"...","reason":"...","last_used_bom":"...","recommended_action":"archive|review|delete"}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-engineering-change', aiRateLimit, async (req, res) => {
  try {
    const { bomId, issue } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are an engineering change management expert. Recommend an engineering change order (ECO).';
    const user = `BOM: ${JSON.stringify(r.rows[0])}, Issue: ${issue}. JSON: {"eco_recommended":true|false,"eco_type":"Mandatory|Optional|Rework","changes":[{"field":"...","current":"...","proposed":"..."}],"justification":"...","priority":"urgent|high|medium|low","estimated_cost":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-bom-maturity', aiRateLimit, async (req, res) => {
  try {
    const { bomId } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a product lifecycle expert. Score the maturity and completeness of this BOM.';
    const user = `BOM: ${JSON.stringify(r.rows[0])}. JSON: {"maturity_score":0-100,"completeness_score":0-100,"areas":[{"area":"...","score":0-100,"gaps":[...]}],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-bom-changes', aiRateLimit, async (req, res) => {
  try {
    const recent = await pool.query('SELECT id, bom_number, parent_sku, revision, revision_date, engineering_change_order, updated_at FROM erp_boms ORDER BY updated_at DESC LIMIT 20');
    const sys = 'You are an engineering change analyst. Summarize recent BOM changes.';
    const user = `Recent BOM changes: ${JSON.stringify(recent.rows)}. JSON: {"summary":"...","change_count":0,"high_impact_changes":[...],"trends":[...],"action_items":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-revision-rollout', aiRateLimit, async (req, res) => {
  try {
    const { bomId } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a manufacturing operations expert. Predict the rollout timeline for a BOM revision.';
    const user = `BOM: ${JSON.stringify(r.rows[0])}. JSON: {"rollout_phases":[{"phase":"...","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","activities":[...]}],"total_duration_weeks":0,"key_risks":[...],"go_live_date":"YYYY-MM-DD"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-phantom-bom', aiRateLimit, async (req, res) => {
  try {
    const { bomId } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a BOM structuring expert. Recommend whether to use phantom BOM for sub-assemblies.';
    const user = `BOM: ${JSON.stringify(r.rows[0])}. JSON: {"phantom_bom_recommended":true|false,"phantom_candidates":[{"component":"...","reason":"..."}],"benefits":"...","risks":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-yield', aiRateLimit, async (req, res) => {
  try {
    const { bomId } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a quality engineering expert. Validate the yield percentage for this BOM.';
    const user = `BOM: ${JSON.stringify(r.rows[0])}. JSON: {"yield_valid":true|false,"current_yield_pct":0,"recommended_yield_pct":0,"industry_benchmark_pct":0,"improvement_potential_pct":0,"root_causes_of_loss":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-make-vs-buy', aiRateLimit, async (req, res) => {
  try {
    const { bomId } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a strategic sourcing expert. Classify whether this should be made or bought.';
    const user = `BOM: ${JSON.stringify(r.rows[0])}. JSON: {"recommendation":"Make|Buy|Hybrid","make_cost_estimate":0,"buy_cost_estimate":0,"strategic_factors":[...],"risk_factors":[...],"final_rationale":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-redundant-operation', aiRateLimit, async (req, res) => {
  try {
    const { bomId } = req.body;
    const r = await pool.query('SELECT * FROM erp_boms WHERE id=$1', [bomId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'BOM not found' });
    const sys = 'You are a lean manufacturing expert. Detect redundant operations in the BOM routing.';
    const user = `BOM routings: ${JSON.stringify(r.rows[0].routings)}, Components: ${JSON.stringify(r.rows[0].components)}. JSON: {"redundant_operations":[{"operation":"...","reason":"...","time_savings_hrs":0,"cost_savings":0}],"total_savings":0,"lean_score":0-100}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-bom-cleanup', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const boms = await pool.query('SELECT id, bom_number, parent_sku, revision, status, is_active, component_count, routing_steps, updated_at FROM erp_boms WHERE is_archived=false ORDER BY updated_at ASC LIMIT 50');
    const sys = 'You are a BOM data steward. Recommend BOM cleanup actions.';
    const user = `BOMs: ${JSON.stringify(boms.rows)}. JSON: {"cleanup_actions":[{"bom_id":...,"bom_number":"...","action":"merge|obsolete|update_revision|add_components|archive","priority":"high|medium|low","rationale":"..."}],"estimated_cleanup_hours":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
