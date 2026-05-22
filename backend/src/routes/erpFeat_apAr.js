// ERP Feature: Accounts Payable & Receivable
// 18 CRUD + 16 AI verbs
// Mounted under: /api/erp/ap-ar
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
  const now = Date.now();
  const win = 60 * 60 * 1000;
  const e = _rlMap.get(key) || { count: 0, resetAt: now + win };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + win; }
  e.count++; _rlMap.set(key, e);
  if (e.count > 20) return res.status(429).json({ error: 'AI rate limit exceeded (20/hr)' });
  next();
}

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
    CREATE TABLE IF NOT EXISTS erp_invoices (
      id SERIAL PRIMARY KEY,
      invoice_number VARCHAR(100) UNIQUE NOT NULL,
      invoice_type VARCHAR(20) NOT NULL DEFAULT 'AP',
      vendor_id INTEGER,
      customer_id INTEGER,
      entity_id INTEGER,
      invoice_date DATE NOT NULL,
      due_date DATE,
      currency_code VARCHAR(10) DEFAULT 'USD',
      gross_amount NUMERIC(18,4) DEFAULT 0,
      tax_amount NUMERIC(18,4) DEFAULT 0,
      net_amount NUMERIC(18,4) DEFAULT 0,
      paid_amount NUMERIC(18,4) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'Draft',
      aging_bucket VARCHAR(20),
      payment_terms VARCHAR(50),
      dispute_reason TEXT,
      credit_risk_score NUMERIC(5,2),
      three_way_match_status VARCHAR(30),
      is_archived BOOLEAN DEFAULT false,
      gl_account_id INTEGER,
      description TEXT,
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
    const where = ['is_archived = false'];
    const params = [];
    if (req.query.status) { params.push(req.query.status); where.push(`status = $${params.length}`); }
    if (req.query.invoice_type) { params.push(req.query.invoice_type); where.push(`invoice_type = $${params.length}`); }
    const wc = `WHERE ${where.join(' AND ')}`;
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_invoices ${wc}`, params);
    const total = parseInt(cnt.rows[0].count);
    params.push(limit); params.push(offset);
    const rows = await pool.query(`SELECT * FROM erp_invoices ${wc} ORDER BY invoice_date DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. GET /count
router.get('/count', async (req, res) => {
  try {
    await ensureTable();
    const where = ['is_archived=false'];
    const params = [];
    if (req.query.status) { params.push(req.query.status); where.push(`status=$${params.length}`); }
    if (req.query.invoice_type) { params.push(req.query.invoice_type); where.push(`invoice_type=$${params.length}`); }
    const r = await pool.query(`SELECT COUNT(*) FROM erp_invoices WHERE ${where.join(' AND ')}`, params);
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
    const cnt = await pool.query(`SELECT COUNT(*) FROM erp_invoices WHERE (invoice_number ILIKE $1 OR description ILIKE $1) AND is_archived=false`, [q]);
    const total = parseInt(cnt.rows[0].count);
    const rows = await pool.query(`SELECT * FROM erp_invoices WHERE (invoice_number ILIKE $1 OR description ILIKE $1) AND is_archived=false ORDER BY invoice_date DESC LIMIT $2 OFFSET $3`, [q, limit, offset]);
    res.json({ data: rows.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET /by-vendor/:vendorId
router.get('/by-vendor/:vendorId', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_invoices WHERE vendor_id=$1 AND is_archived=false ORDER BY invoice_date DESC', [req.params.vendorId]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. GET /by-customer/:customerId
router.get('/by-customer/:customerId', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_invoices WHERE customer_id=$1 AND is_archived=false ORDER BY invoice_date DESC', [req.params.customerId]);
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. GET /export/csv
router.get('/export/csv', async (req, res) => {
  try {
    await ensureTable();
    const rows = await pool.query('SELECT * FROM erp_invoices ORDER BY invoice_date DESC');
    const fields = ['id','invoice_number','invoice_type','vendor_id','customer_id','entity_id','invoice_date','due_date','currency_code','gross_amount','tax_amount','net_amount','paid_amount','status','aging_bucket','payment_terms','dispute_reason','credit_risk_score','three_way_match_status','description','created_at','updated_at'];
    const header = fields.join(',');
    const csv = [header, ...rows.rows.map(r => fields.map(f => `"${String(r[f]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ap_ar_invoices.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. GET /stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    await ensureTable();
    const [byStatus, byType, aging] = await Promise.all([
      pool.query('SELECT status, COUNT(*), SUM(net_amount) as total FROM erp_invoices WHERE is_archived=false GROUP BY status'),
      pool.query('SELECT invoice_type, COUNT(*), SUM(net_amount) as total FROM erp_invoices WHERE is_archived=false GROUP BY invoice_type'),
      pool.query('SELECT aging_bucket, COUNT(*), SUM(net_amount) as total FROM erp_invoices WHERE is_archived=false GROUP BY aging_bucket')
    ]);
    res.json({ byStatus: byStatus.rows, byType: byType.rows, byAgingBucket: aging.rows });
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
        'INSERT INTO erp_invoices (invoice_number,invoice_type,vendor_id,customer_id,entity_id,invoice_date,due_date,currency_code,gross_amount,tax_amount,net_amount,payment_terms,description,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
        [item.invoice_number,item.invoice_type||'AP',item.vendor_id||null,item.customer_id||null,item.entity_id||null,item.invoice_date,item.due_date||null,item.currency_code||'USD',item.gross_amount||0,item.tax_amount||0,item.net_amount||0,item.payment_terms||null,item.description||null,item.status||'Draft']
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
      const r = await pool.query(`UPDATE erp_invoices SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, ...Object.values(fields)]);
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
    const r = await pool.query(`UPDATE erp_invoices SET status='Cancelled', updated_at=NOW() WHERE id = ANY($1::int[])`, [ids]);
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
          'INSERT INTO erp_invoices (invoice_number,invoice_type,invoice_date,gross_amount,net_amount,status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (invoice_number) DO NOTHING RETURNING *',
          [obj.invoice_number, obj.invoice_type||'AP', obj.invoice_date||new Date().toISOString().split('T')[0], obj.gross_amount||0, obj.net_amount||0, obj.status||'Draft']
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
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 13. POST /
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body;
    const r = await pool.query(
      'INSERT INTO erp_invoices (invoice_number,invoice_type,vendor_id,customer_id,entity_id,invoice_date,due_date,currency_code,gross_amount,tax_amount,net_amount,payment_terms,description,status,gl_account_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
      [b.invoice_number,b.invoice_type||'AP',b.vendor_id||null,b.customer_id||null,b.entity_id||null,b.invoice_date,b.due_date||null,b.currency_code||'USD',b.gross_amount||0,b.tax_amount||0,b.net_amount||0,b.payment_terms||null,b.description||null,b.status||'Draft',b.gl_account_id||null]
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
    const r = await pool.query(`UPDATE erp_invoices SET ${sets}, updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(b)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 15. DELETE /:id (soft)
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_invoices SET status='Cancelled', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 16. POST /:id/archive
router.post('/:id/archive', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query('UPDATE erp_invoices SET is_archived=true, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 17. POST /:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`UPDATE erp_invoices SET is_archived=false, status='Draft', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 18. GET /:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM audit_logs WHERE entity_type='erp_invoices' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI verbs ──────────────────────────────────────────────────────────────────

router.post('/ai/predict-payment-date', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const sys = 'You are an AP/AR expert. Predict the likely payment date based on invoice details.';
    const user = `Invoice: ${JSON.stringify(r.rows[0])}. JSON: {"predicted_payment_date":"YYYY-MM-DD","confidence":"high|medium|low","days_from_due":0,"risk_factors":[...],"recommendation":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-collection-priority', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const open = await pool.query(`SELECT * FROM erp_invoices WHERE invoice_type='AR' AND status NOT IN ('Paid','Cancelled') AND is_archived=false ORDER BY due_date ASC LIMIT 50`);
    const sys = 'You are an AR collections expert. Prioritize open AR invoices for collection.';
    const user = `Open AR: ${JSON.stringify(open.rows)}. JSON: {"priority_list":[{"invoice_id":...,"invoice_number":"...","priority":"critical|high|medium|low","action":"...","rationale":"..."}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-duplicate-invoice', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const inv = r.rows[0];
    const similar = await pool.query(`SELECT * FROM erp_invoices WHERE vendor_id=$1 AND gross_amount=$2 AND is_archived=false AND id != $3 LIMIT 10`, [inv.vendor_id, inv.gross_amount, inv.id]);
    const sys = 'You are a duplicate invoice detection expert.';
    const user = `Target invoice: ${JSON.stringify(inv)}, Similar invoices: ${JSON.stringify(similar.rows)}. JSON: {"is_duplicate":true|false,"duplicate_candidates":[{"id":...,"similarity_score":0-100,"reason":"..."}],"recommendation":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-dispute-reason', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const sys = 'You are an invoice dispute classification expert.';
    const user = `Invoice: ${JSON.stringify(r.rows[0])}. JSON: {"dispute_category":"Price|Quantity|Quality|Delivery|Duplicate|Other","sub_reason":"...","resolution_path":"...","estimated_days_to_resolve":0}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/score-credit-risk', aiRateLimit, async (req, res) => {
  try {
    const { customerId } = req.body;
    const invoices = await pool.query(`SELECT * FROM erp_invoices WHERE customer_id=$1 AND is_archived=false ORDER BY invoice_date DESC LIMIT 20`, [customerId]);
    const sys = 'You are a credit risk analyst. Score the credit risk of this customer.';
    const user = `Customer ${customerId} invoices: ${JSON.stringify(invoices.rows)}. JSON: {"credit_risk_score":0-100,"risk_tier":"low|medium|high|critical","payment_behavior":"...","recommended_credit_limit":0,"recommended_payment_terms":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/recommend-early-pay-discount', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const sys = 'You are an AP optimization expert. Recommend early pay discount terms.';
    const user = `Invoice: ${JSON.stringify(r.rows[0])}. JSON: {"recommended_discount_pct":0,"discount_days":0,"annualized_return_pct":0,"recommendation":"take|skip","rationale":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-dunning-letter', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId, dunningLevel } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const sys = 'You are an AR collections expert. Generate a dunning letter.';
    const user = `Invoice: ${JSON.stringify(r.rows[0])}, Dunning level: ${dunningLevel||1}. JSON: {"subject":"...","body":"...","tone":"friendly|firm|final","next_steps":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-aging-bucket', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const sys = 'You are an AR aging expert. Predict which aging bucket this invoice will fall into.';
    const user = `Invoice: ${JSON.stringify(r.rows[0])}, Today: ${new Date().toISOString().split('T')[0]}. JSON: {"current_bucket":"Current|1-30|31-60|61-90|90+","predicted_final_bucket":"...","days_overdue":0,"risk_of_write_off":"low|medium|high"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/validate-three-way-match', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId, purchaseOrder, goodsReceipt } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const sys = 'You are an AP matching expert. Validate three-way match between PO, GR, and invoice.';
    const user = `Invoice: ${JSON.stringify(r.rows[0])}, PO: ${JSON.stringify(purchaseOrder)}, GR: ${JSON.stringify(goodsReceipt)}. JSON: {"match_status":"Matched|Partial|Failed","discrepancies":[{"field":"...","po_value":"...","gr_value":"...","invoice_value":"..."}],"recommendation":"approve|hold|reject"}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-fraudulent-vendor', aiRateLimit, async (req, res) => {
  try {
    const { vendorId } = req.body;
    const invoices = await pool.query(`SELECT * FROM erp_invoices WHERE vendor_id=$1 AND is_archived=false ORDER BY invoice_date DESC LIMIT 30`, [vendorId]);
    const sys = 'You are a financial fraud detection expert. Assess vendor fraud risk based on invoicing patterns.';
    const user = `Vendor ${vendorId} invoices: ${JSON.stringify(invoices.rows)}. JSON: {"fraud_risk_score":0-100,"risk_tier":"low|medium|high|critical","red_flags":[...],"recommended_action":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/suggest-vendor-consolidation', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const vendors = await pool.query(`SELECT vendor_id, COUNT(*) as invoice_count, SUM(net_amount) as total_spend FROM erp_invoices WHERE invoice_type='AP' AND is_archived=false GROUP BY vendor_id ORDER BY total_spend DESC LIMIT 50`);
    const sys = 'You are a strategic sourcing expert. Suggest vendor consolidation opportunities.';
    const user = `Vendor spend data: ${JSON.stringify(vendors.rows)}. JSON: {"consolidation_opportunities":[{"vendor_ids":[...],"rationale":"...","estimated_savings_pct":0,"risk":"low|medium|high"}]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/summarize-customer-aging', aiRateLimit, async (req, res) => {
  try {
    const aging = await pool.query(`SELECT aging_bucket, COUNT(*) as count, SUM(net_amount - paid_amount) as outstanding FROM erp_invoices WHERE invoice_type='AR' AND is_archived=false GROUP BY aging_bucket`);
    const sys = 'You are an AR analyst. Summarize the customer aging report.';
    const user = `Aging data: ${JSON.stringify(aging.rows)}. JSON: {"summary":"...","total_outstanding":0,"overdue_pct":0,"top_risks":[...],"recommendations":[...]}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/classify-invoice-status', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const sys = 'You are an AP/AR expert. Classify the correct processing status for this invoice.';
    const user = `Invoice: ${JSON.stringify(r.rows[0])}, Today: ${new Date().toISOString().split('T')[0]}. JSON: {"recommended_status":"Draft|Pending|Approved|Paid|Overdue|Disputed|Cancelled","rationale":"...","next_action":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/generate-write-off-justification', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const sys = 'You are an AR write-off expert. Generate a write-off justification memo.';
    const user = `Invoice: ${JSON.stringify(r.rows[0])}. JSON: {"justification":"...","write_off_amount":0,"gl_account_recommendation":"...","approval_level_required":"...","risk_assessment":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/predict-collection-likelihood', aiRateLimit, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const r = await pool.query('SELECT * FROM erp_invoices WHERE id=$1', [invoiceId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const sys = 'You are an AR collections analyst. Predict collection likelihood.';
    const user = `Invoice: ${JSON.stringify(r.rows[0])}. JSON: {"collection_probability":0-100,"expected_collection_date":"YYYY-MM-DD","expected_recovery_pct":0,"collection_strategy":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ai/detect-payment-fraud-pattern', aiRateLimit, async (req, res) => {
  try {
    await ensureTable();
    const recent = await pool.query(`SELECT * FROM erp_invoices WHERE status='Paid' AND is_archived=false ORDER BY updated_at DESC LIMIT 50`);
    const sys = 'You are a payment fraud detection expert. Analyze payment patterns for fraud indicators.';
    const user = `Recent payments: ${JSON.stringify(recent.rows)}. JSON: {"fraud_indicators":[{"invoice_id":...,"pattern":"...","risk_score":0-100,"recommended_action":"..."}],"overall_risk":"low|medium|high","summary":"..."}`;
    const ai = await callAI(sys, user);
    res.json({ success: ai.success, result: parseJson(ai.content), model: ai.model, usage: ai.usage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
