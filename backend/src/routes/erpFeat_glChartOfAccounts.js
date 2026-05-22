// ERP Feature: GL Chart of Accounts
// 18 CRUD + 16 AI verbs
// Mounted under: /api/erp/gl-chart-of-accounts
'use strict';

const express = require('express');
const https = require('https');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const pool = require('../db');
const router = express.Router();

// ── Auth middleware ────────────────────────────────────────────────────────────
function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}
router.use(authenticateToken);

// ── In-memory AI rate limiter (20/hr per user) ─────────────────────────────────
const _rlMap = new Map();
function aiRateLimit(req, res, next) {
  const key = `user:${req.user?.id || req.ip}`;
  const now = Date.now();
  const win = 60 * 60 * 1000;
  const e = _rlMap.get(key) || { count: 0, resetAt: now + win };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + win; }
  e.count++;
  _rlMap.set(key, e);
  if (e.count > 20) return res.status(429).json({ error: 'AI rate limit exceeded (20/hr)' });
  next();
}

// ── AI helper ─────────────────────────────────────────────────────────────────
async function callAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { success: false, error: 'OPENROUTER_API_KEY not configured' };
  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: 1500, temperature: 0.4
    });
    const opts = {
      hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'AI Manufacturing ERP' }
    };
    const req = https.request(opts, (r) => {
      let body = '';
      r.on('data', c => body += c);
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

async function logAudit(userId, action, entityId, details) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, details, ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [userId, null, action, 'gl_chart_of_accounts', entityId, details, null]
    );
  } catch (_) {}
}

// ── Table init guard ──────────────────────────────────────────────────────────
let _ready = false;
async function ensureTable() {
  if (_ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_gl_accounts (
      id SERIAL PRIMARY KEY,
      account_number VARCHAR(50) UNIQUE NOT NULL,
      account_name VARCHAR(255) NOT NULL,
      account_type VARCHAR(50) NOT NULL,
      parent_id INTEGER REFERENCES erp_gl_accounts(id),
      entity_id INTEGER,
      segment1 VARCHAR(50),
      segment2 VARCHAR(50),
      segment3 VARCHAR(50),
      cost_center VARCHAR(50),
      natural_account VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      is_archived BOOLEAN DEFAULT false,
      allow_posting BOOLEAN DEFAULT true,
      description TEXT,
      currency_code VARCHAR(10) DEFAULT 'USD',
      statutory_account VARCHAR(50),
      ai_suggestions TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  _ready = true;
}

// ── CRUD routes ───────────────────────────────────────────────────────────────

// 1. GET / — list with pagination + filters
router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const where = ['is_archived = false'];
    const params = [];
    if (req.query.account_type) { params.push(req.query.account_type); where.push(`account_type = $${params.length}`); }
    if (req.query.is_active !== undefined) { params.push(req.query.is_active === 'true'); where.push(`is_active = $${params.length}`); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await pool.query(`SELECT COUNT(*) FROM erp_gl_accounts ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count);
    params.push(limit); params.push(offset);
    const rows = await pool.query(`SELECT * FROM erp_gl_accounts ${whereClause} ORDER BY account_number ASC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. GET /count
router.get('/count', async (req, res) => {
  try {
    await ensureTable();
    const where = ['is_archived = false'];
    const params = [];
    if (req.query.account_type) { params.push(req.query.account_type); where.push(`account_type = $${params.length}`); }
    const r = await pool.query(`SELECT COUNT(*) FROM erp_gl_accounts WHERE ${where.join(' AND ')}`, params);
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
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM erp_gl_accounts WHERE (account_number ILIKE $1 OR account_name ILIKE $1 OR description ILIKE $1) AND is_archived = false`, [q]);
    const total = parseInt(countRes.rows[0].count);
    const rows = await pool.query(
      `SELECT * FROM erp_gl_accounts WHERE (account_number ILIKE $1 OR account_name ILIKE $1 OR description ILIKE $1) AND is_archived = false ORDER BY account_number ASC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET /by-parent/:parentId
router.get('/by-parent/:parentId', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_gl_accounts WHERE parent_id = $1 AND is_archived = false ORDER BY account_number', [req.params.parentId]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GET /by-entity/:entityId
router.get('/by-entity/:entityId', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_gl_accounts WHERE entity_id = $1 AND is_archived = false ORDER BY account_number', [req.params.entityId]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. GET /export/csv
router.get('/export/csv', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_gl_accounts ORDER BY account_number');
    const fields = ['id','account_number','account_name','account_type','parent_id','entity_id','segment1','segment2','segment3','cost_center','natural_account','is_active','is_archived','allow_posting','description','currency_code','statutory_account','created_at','updated_at'];
    const header = fields.join(',');
    const csv = [header, ...rows.rows.map(r => fields.map(f => `"${String(r[f] ?? '').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="gl_chart_of_accounts.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. GET /stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    await ensureTable();
    const [byType, active, withChildren] = await Promise.all([
      pool.query(`SELECT account_type, COUNT(*) as count FROM erp_gl_accounts WHERE is_archived=false GROUP BY account_type`),
      pool.query(`SELECT COUNT(*) FROM erp_gl_accounts WHERE is_active=true AND is_archived=false`),
      pool.query(`SELECT COUNT(DISTINCT parent_id) FROM erp_gl_accounts WHERE parent_id IS NOT NULL`)
    ]);
    res.json({ byType: byType.rows, activeCount: parseInt(active.rows[0].count), parentNodeCount: parseInt(withChildren.rows[0].count) });
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
        'INSERT INTO erp_gl_accounts (account_number,account_name,account_type,parent_id,entity_id,segment1,segment2,segment3,cost_center,natural_account,description,currency_code,statutory_account) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
        [item.account_number,item.account_name,item.account_type,item.parent_id||null,item.entity_id||null,item.segment1||null,item.segment2||null,item.segment3||null,item.cost_center||null,item.natural_account||null,item.description||null,item.currency_code||'USD',item.statutory_account||null]
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
      const vals = Object.values(fields);
      if (!sets) { results.push({ error: 'no fields', id }); continue; }
      const r = await pool.query(`UPDATE erp_gl_accounts SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...vals]);
      results.push(r.rows[0] || { error: 'not found', id });
    }
    res.json({ data: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 10. DELETE /batch (soft)
router.delete('/batch', async (req, res) => {
  try {
    await ensureTable();
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
    const r = await pool.query(`UPDATE erp_gl_accounts SET is_active=false, updated_at=NOW() WHERE id = ANY($1::int[])`, [ids]);
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
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || null; });
      try {
        const r = await pool.query(
          'INSERT INTO erp_gl_accounts (account_number,account_name,account_type,description,currency_code) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (account_number) DO NOTHING RETURNING *',
          [obj.account_number, obj.account_name, obj.account_type||'Asset', obj.description||null, obj.currency_code||'USD']
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
    const r = await pool.query('SELECT * FROM erp_gl_accounts WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    await logAudit(req.user?.id, 'view_gl_account', req.params.id, `Viewed account ${r.rows[0].account_number}`);
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. POST /
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const r = await pool.query(
      'INSERT INTO erp_gl_accounts (account_number,account_name,account_type,parent_id,entity_id,segment1,segment2,segment3,cost_center,natural_account,description,currency_code,statutory_account,allow_posting) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
      [b.account_number,b.account_name,b.account_type||'Asset',b.parent_id||null,b.entity_id||null,b.segment1||null,b.segment2||null,b.segment3||null,b.cost_center||null,b.natural_account||null,b.description||null,b.currency_code||'USD',b.statutory_account||null,b.allow_posting!==false]
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
    const r = await pool.query(`UPDATE erp_gl_accounts SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(b)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. DELETE /:id (soft)
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_gl_accounts SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. POST /:id/archive
router.post('/:id/archive', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_gl_accounts SET is_archived=true, is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. POST /:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_gl_accounts SET is_archived=false, is_active=true, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. GET /:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM audit_logs WHERE entity_type='gl_chart_of_accounts' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI verbs ──────────────────────────────────────────────────────────────────

router.post('/ai/suggest-account-naming', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const { accountType, parentId, description } = req.body;
    const sys = 'You are an expert GL accountant. Suggest clear, consistent account names.';
    const user = `Account type: ${accountType}, Parent ID: ${parentId}, Description: ${description}. Suggest 3 account names. JSON: {"suggestions":[{"name":"...","rationale":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-orphan-accounts', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const accounts = await pool.query('SELECT id, account_number, account_name, parent_id FROM erp_gl_accounts WHERE is_archived=false');
    const sys = 'You are a GL data quality expert. Identify orphan accounts that have no parent yet belong to a hierarchy.';
    const user = `Accounts: ${JSON.stringify(accounts.rows.slice(0,100))}. JSON: {"orphans":[{"id":...,"account_number":"...","reason":"..."}],"count":...}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-account-type', aiRateLimit, async (req, res) => {
  try {
    const { accountId } = req.body;
    const r = await pool.query('SELECT * FROM erp_gl_accounts WHERE id=$1', [accountId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    const acc = r.rows[0];
    const sys = 'You are a GL expert. Classify the correct account type.';
    const user = `Account: ${JSON.stringify(acc)}. JSON: {"recommended_type":"Asset|Liability|Equity|Revenue|Expense","confidence":"high|medium|low","rationale":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-hierarchy', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const accounts = await pool.query('SELECT id, account_number, account_name, account_type, parent_id FROM erp_gl_accounts WHERE is_archived=false ORDER BY account_number LIMIT 100');
    const sys = 'You are a financial systems architect. Suggest an optimal GL account hierarchy.';
    const user = `Current accounts: ${JSON.stringify(accounts.rows)}. JSON: {"hierarchy_suggestions":[{"parent_account":"...","child_accounts":[...],"rationale":"..."}],"overall_score":0-100}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-segment-combos', aiRateLimit, async (req, res) => {
  try {
    const { segment1, segment2, segment3, costCenter } = req.body;
    const sys = 'You are a GL segment validation expert.';
    const user = `Segments: segment1=${segment1}, segment2=${segment2}, segment3=${segment3}, costCenter=${costCenter}. JSON: {"valid":true|false,"issues":[...],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-period-end-balance', aiRateLimit, async (req, res) => {
  try {
    const { accountId, historicalBalances, currentPeriodActivity } = req.body;
    const sys = 'You are a financial forecasting expert. Predict period-end GL account balances.';
    const user = `Account ID: ${accountId}, Historical: ${JSON.stringify(historicalBalances)}, Current activity: ${JSON.stringify(currentPeriodActivity)}. JSON: {"predicted_balance":0,"confidence":"high|medium|low","key_drivers":[...],"variance_from_budget":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-account-merge', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const accounts = await pool.query('SELECT id, account_number, account_name, account_type FROM erp_gl_accounts WHERE is_archived=false ORDER BY account_number LIMIT 200');
    const sys = 'You are a GL rationalization expert. Identify accounts that can be merged to simplify the COA.';
    const user = `Accounts: ${JSON.stringify(accounts.rows)}. JSON: {"merge_candidates":[{"accounts":[...],"suggested_merged_name":"...","rationale":"...","estimated_savings":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-duplicate-coa', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const accounts = await pool.query('SELECT id, account_number, account_name, account_type, description FROM erp_gl_accounts WHERE is_archived=false');
    const sys = 'You are a data quality expert. Detect duplicate or near-duplicate GL accounts.';
    const user = `Accounts: ${JSON.stringify(accounts.rows.slice(0,150))}. JSON: {"duplicates":[{"account_ids":[...],"similarity_reason":"...","recommended_action":"keep|merge|delete"}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-mapping-to-target-coa', aiRateLimit, async (req, res) => {
  try {
    const { targetCoaSchema, sourceAccountIds } = req.body;
    await ensureTable();
    const accounts = await pool.query('SELECT * FROM erp_gl_accounts WHERE id = ANY($1::int[])', [sourceAccountIds || []]);
    const sys = 'You are a financial systems integration expert. Generate account mappings from source to target COA.';
    const user = `Source accounts: ${JSON.stringify(accounts.rows)}, Target schema: ${JSON.stringify(targetCoaSchema)}. JSON: {"mappings":[{"source_id":...,"source_number":"...","target_number":"...","confidence":"...","notes":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-coa-cleanliness', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const [total, inactive, orphans, noDesc] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM erp_gl_accounts WHERE is_archived=false'),
      pool.query('SELECT COUNT(*) FROM erp_gl_accounts WHERE is_active=false AND is_archived=false'),
      pool.query('SELECT COUNT(*) FROM erp_gl_accounts WHERE parent_id IS NULL AND is_archived=false AND account_type NOT IN (\'Asset\',\'Liability\',\'Equity\',\'Revenue\',\'Expense\')'),
      pool.query('SELECT COUNT(*) FROM erp_gl_accounts WHERE description IS NULL AND is_archived=false')
    ]);
    const sys = 'You are a GL data quality expert. Score the cleanliness of this Chart of Accounts.';
    const user = `Stats: total=${total.rows[0].count}, inactive=${inactive.rows[0].count}, orphans=${orphans.rows[0].count}, no_description=${noDesc.rows[0].count}. JSON: {"cleanliness_score":0-100,"grade":"A|B|C|D|F","issues":[{"issue":"...","severity":"high|medium|low","count":...}],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-statutory-account', aiRateLimit, async (req, res) => {
  try {
    const { accountId, jurisdiction } = req.body;
    const r = await pool.query('SELECT * FROM erp_gl_accounts WHERE id=$1', [accountId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    const sys = 'You are a statutory accounting expert.';
    const user = `Account: ${JSON.stringify(r.rows[0])}, Jurisdiction: ${jurisdiction||'US GAAP'}. JSON: {"statutory_account":"...","statutory_name":"...","framework":"...","rationale":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-cost-center', aiRateLimit, async (req, res) => {
  try {
    const { accountId } = req.body;
    const r = await pool.query('SELECT * FROM erp_gl_accounts WHERE id=$1', [accountId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    const sys = 'You are a management accounting expert. Classify the cost center type.';
    const user = `Account: ${JSON.stringify(r.rows[0])}. JSON: {"cost_center_type":"Production|Support|Admin|Sales|R&D","classification_rationale":"...","recommended_cost_center_code":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-natural-account', aiRateLimit, async (req, res) => {
  try {
    const { accountId } = req.body;
    const r = await pool.query('SELECT * FROM erp_gl_accounts WHERE id=$1', [accountId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    const sys = 'You are a GL expert. Validate the natural account segment against the account type.';
    const user = `Account: ${JSON.stringify(r.rows[0])}. JSON: {"valid":true|false,"expected_range":"...","actual_natural_account":"...","issues":[...],"corrective_action":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-dimensional-tagging', aiRateLimit, async (req, res) => {
  try {
    const { accountId } = req.body;
    const r = await pool.query('SELECT * FROM erp_gl_accounts WHERE id=$1', [accountId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' });
    const sys = 'You are a financial analytics expert. Suggest dimensional tags for GL reporting.';
    const user = `Account: ${JSON.stringify(r.rows[0])}. JSON: {"dimensions":[{"dimension_name":"...","suggested_value":"...","rationale":"..."}],"reporting_benefit":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-coa-changes', aiRateLimit, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM audit_logs WHERE entity_type='gl_chart_of_accounts' ORDER BY created_at DESC LIMIT 50`);
    const sys = 'You are a financial systems auditor. Summarize recent Chart of Accounts changes.';
    const user = `Recent changes: ${JSON.stringify(r.rows)}. JSON: {"summary":"...","change_categories":[{"category":"...","count":...}],"risk_items":[...],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-archival-candidates', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const accounts = await pool.query(`SELECT id, account_number, account_name, account_type, is_active, allow_posting, created_at FROM erp_gl_accounts WHERE is_archived=false AND is_active=false ORDER BY created_at ASC LIMIT 100`);
    const sys = 'You are a GL housekeeping expert. Recommend accounts for archival.';
    const user = `Inactive accounts: ${JSON.stringify(accounts.rows)}. JSON: {"archival_candidates":[{"id":...,"account_number":"...","reason":"...","priority":"high|medium|low"}],"estimated_cleanup_benefit":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
