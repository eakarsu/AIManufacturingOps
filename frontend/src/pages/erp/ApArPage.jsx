import React, { useState, useEffect } from 'react';
import { useErpList, erpGet, erpCreate, erpUpdate, erpDelete } from './useErpApi';
import { S, Pagination, AiVerbsPanel, useConfirm, Modal } from './ErpShared';

const ENDPOINT = 'ap-ar';
const AI_VERBS = [
  'predict-payment-date','suggest-collection-priority','detect-duplicate-invoice',
  'classify-dispute-reason','score-credit-risk','recommend-early-pay-discount',
  'generate-dunning-letter','predict-aging-bucket','validate-three-way-match',
  'detect-fraudulent-vendor','suggest-vendor-consolidation','summarize-customer-aging',
  'classify-invoice-status','generate-write-off-justification',
  'predict-collection-likelihood','detect-payment-fraud-pattern',
];
const TYPES = ['AP','AR'];
const STATUSES = ['Draft','Pending','Approved','Paid','Overdue','Disputed','Cancelled'];

function InvoiceForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    invoice_number: '', invoice_type: 'AP', invoice_date: new Date().toISOString().split('T')[0],
    due_date: '', currency_code: 'USD', gross_amount: 0, tax_amount: 0,
    net_amount: 0, payment_terms: '', description: '', status: 'Draft',
    vendor_id: '', customer_id: '',
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault(); setSaving(true); setErr(null);
    try {
      if (initial?.id) await erpUpdate(ENDPOINT, initial.id, form);
      else await erpCreate(ENDPOINT, form);
      onSave();
    } catch (ex) { setErr(ex.response?.data?.error || ex.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit}>
      {err && <div style={S.errorBox}>{err}</div>}
      <div style={S.grid2}>
        <div style={S.formGroup}><label style={S.label}>Invoice Number *</label>
          <input style={S.input} required value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Type</label>
          <select style={S.input} value={form.invoice_type} onChange={e => set('invoice_type', e.target.value)}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>Invoice Date *</label>
          <input type="date" style={S.input} required value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Due Date</label>
          <input type="date" style={S.input} value={form.due_date || ''} onChange={e => set('due_date', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Gross Amount</label>
          <input type="number" style={S.input} value={form.gross_amount} onChange={e => set('gross_amount', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Tax Amount</label>
          <input type="number" style={S.input} value={form.tax_amount} onChange={e => set('tax_amount', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Net Amount</label>
          <input type="number" style={S.input} value={form.net_amount} onChange={e => set('net_amount', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Status</label>
          <select style={S.input} value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>Currency</label>
          <input style={S.input} value={form.currency_code} onChange={e => set('currency_code', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Payment Terms</label>
          <input style={S.input} value={form.payment_terms || ''} onChange={e => set('payment_terms', e.target.value)} />
        </div>
      </div>
      <div style={S.formGroup}><label style={S.label}>Description</label>
        <textarea style={{ ...S.input, resize: 'vertical', minHeight: 60 }} value={form.description || ''} onChange={e => set('description', e.target.value)} />
      </div>
      <div style={{ ...S.row, marginTop: 8 }}>
        <button type="submit" style={{ ...S.btn, ...S.btnPrimary }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" style={{ ...S.btn, ...S.btnSecondary }} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function DetailPanel({ id, onClose }) {
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    erpGet(ENDPOINT, id).then(d => { setRec(d); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);
  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>;
  if (!rec) return <p style={{ color: '#f87171' }}>Not found</p>;
  const fields = ['invoice_number','invoice_type','invoice_date','due_date','currency_code','gross_amount','tax_amount','net_amount','paid_amount','status','aging_bucket','payment_terms'];
  return (
    <div>
      <div style={S.grid2}>
        {fields.map(k => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>{k.replace(/_/g,' ')}</div>
            <div style={{ color: 'var(--text-primary)', fontSize: 14 }}>{String(rec[k] ?? '—')}</div>
          </div>
        ))}
      </div>
      <AiVerbsPanel endpoint={ENDPOINT} verbs={AI_VERBS} />
      <div style={{ ...S.row, marginTop: 12 }}>
        <button style={{ ...S.btn, ...S.btnSecondary }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function ApArPage() {
  const { data, pagination, loading, error, page, setPage, refresh } = useErpList(ENDPOINT);
  const { confirm, Dialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const statusColor = (s) => ({ Paid: 'green', Overdue: 'red', Approved: 'blue', Draft: 'blue', Disputed: 'yellow' }[s] || 'blue');

  return (
    <div style={S.page}>
      <Dialog />
      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit Invoice' : 'Create Invoice'} onClose={() => { setShowCreate(false); setEditing(null); }}>
          <InvoiceForm initial={editing} onSave={() => { setShowCreate(false); setEditing(null); refresh(); }} onCancel={() => { setShowCreate(false); setEditing(null); }} />
        </Modal>
      )}
      {detail && (
        <Modal title={`Invoice Detail — ${detail}`} onClose={() => setDetail(null)}>
          <DetailPanel id={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>Accounts Payable / Receivable</h1>
          <p style={S.sub}>Invoice management, aging analysis, and payment processing</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>+ New Invoice</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : data.length === 0 ? <div style={S.empty}>No invoices found</div> : (
          <table style={S.table}>
            <thead>
              <tr>{['Invoice #','Type','Date','Due','Gross','Net','Status','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td style={S.td}><span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{row.invoice_number}</span></td>
                  <td style={S.td}><span style={S.badge(row.invoice_type === 'AP' ? 'yellow' : 'blue')}>{row.invoice_type}</span></td>
                  <td style={S.td}>{row.invoice_date?.split('T')[0] || '—'}</td>
                  <td style={S.td}>{row.due_date?.split('T')[0] || '—'}</td>
                  <td style={S.td}>{Number(row.gross_amount || 0).toLocaleString()}</td>
                  <td style={S.td}>{Number(row.net_amount || 0).toLocaleString()}</td>
                  <td style={S.td}><span style={S.badge(statusColor(row.status))}>{row.status}</span></td>
                  <td style={S.td}>
                    <div style={S.row}>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setDetail(row.id)}>View</button>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setEditing(row)}>Edit</button>
                      <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => confirm(`Delete invoice ${row.invoice_number}?`, async () => { await erpDelete(ENDPOINT, row.id); refresh(); })}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination pagination={pagination} page={page} setPage={setPage} />
      </div>

      <AiVerbsPanel endpoint={ENDPOINT} verbs={AI_VERBS} />
    </div>
  );
}
