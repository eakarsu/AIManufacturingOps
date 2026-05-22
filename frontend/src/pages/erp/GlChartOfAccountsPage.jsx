import React, { useState, useEffect } from 'react';
import { useErpList, erpGet, erpCreate, erpUpdate, erpDelete } from './useErpApi';
import { S, Pagination, AiVerbsPanel, useConfirm, Modal } from './ErpShared';

const ENDPOINT = 'gl-chart-of-accounts';
const AI_VERBS = [
  'suggest-account-naming','detect-orphan-accounts','classify-account-type',
  'suggest-hierarchy','validate-segment-combos','predict-period-end-balance',
  'recommend-account-merge','detect-duplicate-coa','generate-mapping-to-target-coa',
  'score-coa-cleanliness','suggest-statutory-account','classify-cost-center',
  'validate-natural-account','suggest-dimensional-tagging','summarize-coa-changes',
  'recommend-archival-candidates',
];
const ACCOUNT_TYPES = ['Asset','Liability','Equity','Revenue','Expense'];

function AccountForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    account_number: '', account_name: '', account_type: 'Asset',
    description: '', currency_code: 'USD', cost_center: '',
    segment1: '', segment2: '', segment3: '', natural_account: '',
    statutory_account: '', allow_posting: true,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      if (initial?.id) { await erpUpdate(ENDPOINT, initial.id, form); }
      else { await erpCreate(ENDPOINT, form); }
      onSave();
    } catch (ex) { setErr(ex.response?.data?.error || ex.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit}>
      {err && <div style={S.errorBox}>{err}</div>}
      <div style={S.grid2}>
        <div style={S.formGroup}><label style={S.label}>Account Number *</label>
          <input style={S.input} required value={form.account_number} onChange={e => set('account_number', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Account Name *</label>
          <input style={S.input} required value={form.account_name} onChange={e => set('account_name', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Account Type</label>
          <select style={S.input} value={form.account_type} onChange={e => set('account_type', e.target.value)}>
            {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>Currency Code</label>
          <input style={S.input} value={form.currency_code} onChange={e => set('currency_code', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Cost Center</label>
          <input style={S.input} value={form.cost_center || ''} onChange={e => set('cost_center', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Natural Account</label>
          <input style={S.input} value={form.natural_account || ''} onChange={e => set('natural_account', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Segment 1</label>
          <input style={S.input} value={form.segment1 || ''} onChange={e => set('segment1', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Segment 2</label>
          <input style={S.input} value={form.segment2 || ''} onChange={e => set('segment2', e.target.value)} />
        </div>
      </div>
      <div style={S.formGroup}><label style={S.label}>Description</label>
        <textarea style={{ ...S.input, resize: 'vertical', minHeight: 70 }} value={form.description || ''} onChange={e => set('description', e.target.value)} />
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
  return (
    <div>
      <div style={S.grid2}>
        {['account_number','account_name','account_type','currency_code','cost_center','natural_account','segment1','segment2','segment3','statutory_account','is_active','allow_posting'].map(k => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>{k.replace(/_/g,' ')}</div>
            <div style={{ color: 'var(--text-primary)', fontSize: 14 }}>{String(rec[k] ?? '—')}</div>
          </div>
        ))}
      </div>
      {rec.description && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Description</div><div style={{ color: 'var(--text-primary)', fontSize: 14 }}>{rec.description}</div></div>}
      <AiVerbsPanel endpoint={ENDPOINT} verbs={AI_VERBS} />
      <div style={{ ...S.row, marginTop: 16 }}>
        <button style={{ ...S.btn, ...S.btnSecondary }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function GlChartOfAccountsPage() {
  const { data, pagination, loading, error, page, setPage, refresh } = useErpList(ENDPOINT);
  const { confirm, Dialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  async function handleDelete(id, num) {
    confirm(`Deactivate account ${num}?`, async () => {
      await erpDelete(ENDPOINT, id);
      refresh();
    });
  }

  const typeColor = (t) => ({ Asset: 'blue', Liability: 'yellow', Equity: 'green', Revenue: 'green', Expense: 'red' }[t] || 'blue');

  return (
    <div style={S.page}>
      <Dialog />
      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit GL Account' : 'Create GL Account'} onClose={() => { setShowCreate(false); setEditing(null); }}>
          <AccountForm
            initial={editing}
            onSave={() => { setShowCreate(false); setEditing(null); refresh(); }}
            onCancel={() => { setShowCreate(false); setEditing(null); }}
          />
        </Modal>
      )}
      {detail && (
        <Modal title={`Account Detail — ${detail}`} onClose={() => setDetail(null)}>
          <DetailPanel id={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>GL Chart of Accounts</h1>
          <p style={S.sub}>General Ledger account hierarchy and segment management</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>+ New Account</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : data.length === 0 ? <div style={S.empty}>No accounts found</div> : (
          <table style={S.table}>
            <thead>
              <tr>
                {['Account #','Name','Type','Currency','Cost Center','Active','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td style={S.td}><span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{row.account_number}</span></td>
                  <td style={S.td}>{row.account_name}</td>
                  <td style={S.td}><span style={S.badge(typeColor(row.account_type))}>{row.account_type}</span></td>
                  <td style={S.td}>{row.currency_code}</td>
                  <td style={S.td}>{row.cost_center || '—'}</td>
                  <td style={S.td}><span style={S.badge(row.is_active ? 'green' : 'red')}>{row.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={S.td}>
                    <div style={S.row}>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setDetail(row.id)}>View</button>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setEditing(row)}>Edit</button>
                      <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => handleDelete(row.id, row.account_number)}>Del</button>
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
