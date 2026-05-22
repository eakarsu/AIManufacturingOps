// ERP Feature: Intercompany Transactions
// 18 CRUD + 16 AI verbs
// Mounted under: /api/erp/intercompany
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
    CREATE TABLE IF NOT EXISTS erp_intercompany (
      id SERIAL PRIMARY KEY,
      transaction_id VARCHAR(100) UNIQUE NOT NULL,
      from_entity_id INTEGER NOT NULL,
      to_entity_id INTEGER NOT NULL,
      transaction_type VARCHAR(50) DEFAULT 'Sale',
      transaction_date DATE NOT NULL,
      currency_code VARCHAR(10) DEFAULT 'USD',
      amount NUMERIC(18,4) DEFAULT 0,
      matched_amount NUMERIC(18,4) DEFAULT 0,
      elimination_amount NUMERIC(18,4) DEFAULT 0,
      balance NUMERIC(18,4) DEFAULT 0,
      matching_key VARCHAR(100),
      matching_status VARCHAR(30) DEFAULT 'Unmatched',
      ic_purpose VARCHAR(100),
      recharge_method VARCHAR(50),
      transfer_price NUMERIC(18,4),
      tax_treatment VARCHAR(50),
      netting_eligible BOOLEAN DEFAULT false,
      netting_batch_id VARCHAR(100),
      is_stale BOOLEAN DEFAULT false,
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
    if (req.query.matching_status) { params.push(req.query.matching_status); where.push(`matching_status=$${params.length}`); }
    if (req.query.status) { params.push(req.query.status); where.push(`status=$${params.length}`); }
    const wc = `WHERE ${where.join(' AND ')}`;
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_intercompany ${wc}`, params);
    const total = parseInt(cnt.rows[0].count);
    params.push(limit); params.push(offset);
    const rows = await pool.query(`SELECT * FROM erp_intercompany ${wc} ORDER BY transaction_date DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. GET /count
router.get('/count', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('SELECT COUNT(*) FROM erp_intercompany WHERE is_archived=false');
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
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_intercompany WHERE (transaction_id ILIKE $1 OR matching_key ILIKE $1 OR ic_purpose ILIKE $1) AND is_archived=false`, [q]);
    const total = parseInt(cnt.rows[0].count);
    const rows = await pool.query(`SELECT * FROM erp_intercompany WHERE (transaction_id ILIKE $1 OR matching_key ILIKE $1 OR ic_purpose ILIKE $1) AND is_archived=false ORDER BY transaction_date DESC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET /by-from-entity/:entityId
router.get('/by-from-entity/:entityId', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_intercompany WHERE from_entity_id=$1 AND is_archived=false ORDER BY transaction_date DESC', [req.params.entityId]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GET /by-to-entity/:entityId
router.get('/by-to-entity/:entityId', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_intercompany WHERE to_entity_id=$1 AND is_archived=false ORDER BY transaction_date DESC', [req.params.entityId]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. GET /export/csv
router.get('/export/csv', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT id,transaction_id,from_entity_id,to_entity_id,transaction_type,transaction_date,currency_code,amount,matched_amount,elimination_amount,balance,matching_key,matching_status,ic_purpose,recharge_method,transfer_price,tax_treatment,netting_eligible,is_stale,status,created_at FROM erp_intercompany ORDER BY transaction_date DESC');
    const fields = ['id','transaction_id','from_entity_id','to_entity_id','transaction_type','transaction_date','currency_code','amount','matched_amount','elimination_amount','balance','matching_key','matching_status','ic_purpose','recharge_method','transfer_price','tax_treatment','netting_eligible','is_stale','status','created_at'];
    const header = fields.join(',');
    const csv = [header, ...rows.rows.map(r => fields.map(f => `"${String(r[f]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="intercompany.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. GET /stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    await ensureTable();
    const [byStatus, byMatch, totals] = await Promise.all([
      pool.query('SELECT status, COUNT(*), SUM(amount) as total FROM erp_intercompany WHERE is_archived=false GROUP BY status'),
      pool.query('SELECT matching_status, COUNT(*), SUM(balance) as total_balance FROM erp_intercompany WHERE is_archived=false GROUP BY matching_status'),
      pool.query('SELECT SUM(amount) as total_volume, SUM(elimination_amount) as total_eliminated, SUM(balance) as total_open_balance, COUNT(*) FILTER (WHERE is_stale=true) as stale_count FROM erp_intercompany WHERE is_archived=false')
    ]);
    res.json({ byStatus: byStatus.rows, byMatchingStatus: byMatch.rows, totals: totals.rows[0] });
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
        'INSERT INTO erp_intercompany (transaction_id,from_entity_id,to_entity_id,transaction_type,transaction_date,currency_code,amount,matching_key,ic_purpose,recharge_method,transfer_price,tax_treatment,netting_eligible,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
        [item.transaction_id,item.from_entity_id,item.to_entity_id,item.transaction_type||'Sale',item.transaction_date,item.currency_code||'USD',item.amount||0,item.matching_key||null,item.ic_purpose||null,item.recharge_method||null,item.transfer_price||null,item.tax_treatment||null,item.netting_eligible||false,item.status||'Open']
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
      const r = await pool.query(`UPDATE erp_intercompany SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...Object.values(fields)]);
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
    const r = await pool.query(`UPDATE erp_intercompany SET status='Cancelled', updated_at=NOW() WHERE id = ANY($1::int[])`, [ids]);
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
        const r = await pool.query('INSERT INTO erp_intercompany (transaction_id,from_entity_id,to_entity_id,transaction_date,amount) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (transaction_id) DO NOTHING RETURNING *',
          [obj.transaction_id, obj.from_entity_id||1, obj.to_entity_id||2, obj.transaction_date||new Date().toISOString().split('T')[0], obj.amount||0]);
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
    const r = await pool.query('SELECT * FROM erp_intercompany WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. POST /
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const r = await pool.query(
      'INSERT INTO erp_intercompany (transaction_id,from_entity_id,to_entity_id,transaction_type,transaction_date,currency_code,amount,matched_amount,elimination_amount,balance,matching_key,ic_purpose,recharge_method,transfer_price,tax_treatment,netting_eligible,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',
      [b.transaction_id,b.from_entity_id,b.to_entity_id,b.transaction_type||'Sale',b.transaction_date,b.currency_code||'USD',b.amount||0,b.matched_amount||0,b.elimination_amount||0,b.balance||b.amount||0,b.matching_key||null,b.ic_purpose||null,b.recharge_method||null,b.transfer_price||null,b.tax_treatment||null,b.netting_eligible||false,b.status||'Open']
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
    const r = await pool.query(`UPDATE erp_intercompany SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(b)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_intercompany SET status='Cancelled', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. POST /:id/archive
router.post('/:id/archive', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_intercompany SET is_archived=true, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. POST /:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_intercompany SET is_archived=false, status='Open', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. GET /:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM audit_logs WHERE entity_type='erp_intercompany' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI verbs ──────────────────────────────────────────────────────────────────

router.post('/ai/detect-ic-mismatch', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const unmatched = await pool.query(`SELECT * FROM erp_intercompany WHERE matching_status='Unmatched' AND is_archived=false ORDER BY transaction_date ASC LIMIT 50`);
    const sys = 'You are an intercompany reconciliation expert. Detect IC mismatches.';
    const user = `Unmatched IC transactions: ${JSON.stringify(unmatched.rows)}. JSON: {"mismatches":[{"transaction_id":"...","mismatch_type":"amount|timing|account|missing_counterpart","difference":0,"resolution":"..."}],"total_mismatch_value":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-matching-key', aiRateLimit, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const r = await pool.query('SELECT * FROM erp_intercompany WHERE id=$1', [transactionId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    const sys = 'You are an IC matching expert. Suggest a matching key for this transaction.';
    const user = `IC transaction: ${JSON.stringify(r.rows[0])}. JSON: {"suggested_matching_key":"...","matching_logic":"...","confidence":"high|medium|low","alternative_keys":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-elimination-gap', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const open = await pool.query('SELECT * FROM erp_intercompany WHERE matching_status!=\'Matched\' AND is_archived=false ORDER BY transaction_date ASC LIMIT 50');
    const sys = 'You are a consolidation expert. Predict elimination gaps before period close.';
    const user = `Open IC transactions: ${JSON.stringify(open.rows)}. JSON: {"predicted_gap":0,"gap_by_pair":[{"from_entity":...,"to_entity":...,"gap":0}],"recommendations":[...],"close_risk":"low|medium|high"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-ic-purpose', aiRateLimit, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const r = await pool.query('SELECT * FROM erp_intercompany WHERE id=$1', [transactionId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    const sys = 'You are an IC classification expert. Classify the business purpose of this IC transaction.';
    const user = `IC transaction: ${JSON.stringify(r.rows[0])}. JSON: {"purpose_category":"goods|services|royalty|loan|management_fee|dividend|capital","sub_category":"...","commercial_rationale":"...","elimination_impact":"full|partial|none"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-transfer-pricing', aiRateLimit, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const r = await pool.query('SELECT * FROM erp_intercompany WHERE id=$1', [transactionId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    const sys = 'You are a transfer pricing expert. Validate the transfer price for this IC transaction.';
    const user = `IC transaction: ${JSON.stringify(r.rows[0])}. JSON: {"transfer_price_compliant":true|false,"arm_length_range":{"low":0,"high":0},"methodology":"CUP|RPM|CPM|TNMM|PS","adjustment_required":0,"audit_risk":"low|medium|high","documentation_required":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-ic-confirmation', aiRateLimit, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const r = await pool.query('SELECT * FROM erp_intercompany WHERE id=$1', [transactionId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    const sys = 'You are an IC accountant. Generate an IC confirmation request.';
    const user = `IC transaction: ${JSON.stringify(r.rows[0])}. JSON: {"confirmation_subject":"...","confirmation_body":"...","details_to_confirm":{"amount":0,"date":"...","account":"...","reference":"..."},"response_deadline":"YYYY-MM-DD"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-netting', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const eligible = await pool.query('SELECT * FROM erp_intercompany WHERE netting_eligible=true AND matching_status!=\'Matched\' AND is_archived=false LIMIT 50');
    const sys = 'You are an IC netting expert. Recommend intercompany netting arrangements.';
    const user = `Netting-eligible IC transactions: ${JSON.stringify(eligible.rows)}. JSON: {"netting_batches":[{"entities":[...],"gross_amount":0,"net_amount":0,"saving":0,"currency":"..."}],"total_cash_flow_reduction":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-ic-volume', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const volume = await pool.query('SELECT from_entity_id, to_entity_id, SUM(amount) as total, COUNT(*) as count, currency_code FROM erp_intercompany WHERE is_archived=false GROUP BY from_entity_id, to_entity_id, currency_code ORDER BY total DESC LIMIT 20');
    const sys = 'You are an IC analyst. Summarize intercompany transaction volume.';
    const user = `IC volume by entity pair: ${JSON.stringify(volume.rows)}. JSON: {"summary":"...","total_ic_volume":0,"top_entity_pairs":[...],"currency_breakdown":[...],"observations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-ic-process-health', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const [total, unmatched, stale, noKey] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM erp_intercompany WHERE is_archived=false'),
      pool.query(`SELECT COUNT(*) FROM erp_intercompany WHERE matching_status='Unmatched' AND is_archived=false`),
      pool.query('SELECT COUNT(*) FROM erp_intercompany WHERE is_stale=true AND is_archived=false'),
      pool.query('SELECT COUNT(*) FROM erp_intercompany WHERE matching_key IS NULL AND is_archived=false')
    ]);
    const sys = 'You are an IC process expert. Score the health of the intercompany process.';
    const user = `Total=${total.rows[0].count}, Unmatched=${unmatched.rows[0].count}, Stale=${stale.rows[0].count}, No key=${noKey.rows[0].count}. JSON: {"health_score":0-100,"grade":"A|B|C|D|F","issues":[{"issue":"...","count":0,"severity":"..."}],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-stale-ic-balance', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const stale = await pool.query('SELECT * FROM erp_intercompany WHERE is_stale=true AND is_archived=false ORDER BY transaction_date ASC LIMIT 30');
    const sys = 'You are an IC balance expert. Analyze stale intercompany balances.';
    const user = `Stale IC balances: ${JSON.stringify(stale.rows)}. JSON: {"stale_count":${stale.rows.length},"total_stale_value":0,"recommendations":[{"transaction_id":"...","action":"write_off|settle|investigate","priority":"...","rationale":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-clean-up-batch', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const issues = await pool.query(`SELECT * FROM erp_intercompany WHERE (matching_status='Unmatched' OR is_stale=true OR balance != 0) AND is_archived=false ORDER BY transaction_date ASC LIMIT 50`);
    const sys = 'You are an IC clean-up expert. Suggest a clean-up batch for open IC items.';
    const user = `IC items needing cleanup: ${JSON.stringify(issues.rows)}. JSON: {"cleanup_batches":[{"batch_name":"...","transactions":[...],"action":"settle|netting|write_off","total_amount":0,"priority":"..."}],"estimated_clean_up_days":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-tax-treatment', aiRateLimit, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const r = await pool.query('SELECT * FROM erp_intercompany WHERE id=$1', [transactionId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    const sys = 'You are a tax expert. Validate the tax treatment of this IC transaction.';
    const user = `IC transaction: ${JSON.stringify(r.rows[0])}. JSON: {"tax_treatment_valid":true|false,"recommended_tax_treatment":"...","withholding_tax_applicable":true|false,"withholding_rate_pct":0,"vat_applicable":true|false,"issues":[...],"risk":"low|medium|high"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-ic-recharge-method', aiRateLimit, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const r = await pool.query('SELECT * FROM erp_intercompany WHERE id=$1', [transactionId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    const sys = 'You are an IC recharge methodology expert. Classify the appropriate recharge method.';
    const user = `IC transaction: ${JSON.stringify(r.rows[0])}. JSON: {"recommended_method":"direct|allocation|cost_plus|market_based","current_method_adequate":true|false,"rationale":"...","alternative_methods":[...],"documentation_requirements":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-audit-finding', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const highRisk = await pool.query(`SELECT * FROM erp_intercompany WHERE (matching_status!='Matched' OR is_stale=true OR transfer_price IS NULL) AND is_archived=false ORDER BY amount DESC LIMIT 30`);
    const sys = 'You are an IC audit expert. Predict potential audit findings.';
    const user = `High-risk IC transactions: ${JSON.stringify(highRisk.rows)}. JSON: {"predicted_findings":[{"transaction_id":"...","finding_type":"transfer_pricing|documentation|timing|matching|tax","severity":"major|moderate|minor","likelihood":"high|medium|low","preventive_action":"..."}],"overall_audit_risk":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-ic-narrative', aiRateLimit, async (req, res) => {
  try {
    const { fromEntityId, toEntityId, period } = req.body;
    const txns = await pool.query('SELECT * FROM erp_intercompany WHERE from_entity_id=$1 AND to_entity_id=$2 AND is_archived=false ORDER BY transaction_date DESC LIMIT 20', [fromEntityId, toEntityId]);
    const sys = 'You are a financial reporting expert. Generate a narrative for IC transactions between two entities.';
    const user = `IC transactions (entity ${fromEntityId} to ${toEntityId}), period: ${period}: ${JSON.stringify(txns.rows)}. JSON: {"narrative":"...","transaction_summary":"...","key_flows":[...],"accounting_treatment":"...","disclosure_requirements":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/explain-imbalance-cause', aiRateLimit, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const r = await pool.query('SELECT * FROM erp_intercompany WHERE id=$1', [transactionId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'IC transaction not found' });
    const sys = 'You are an IC reconciliation expert. Explain the cause of the IC imbalance.';
    const user = `IC transaction: ${JSON.stringify(r.rows[0])}. JSON: {"imbalance_amount":0,"likely_causes":[{"cause":"...","probability":"high|medium|low","evidence":"..."}],"primary_cause":"...","corrective_steps":[...],"timeline":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
