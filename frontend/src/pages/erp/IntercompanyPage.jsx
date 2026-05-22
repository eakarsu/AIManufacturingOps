import React, { useState, useEffect } from 'react';
import { useErpList, erpGet, erpCreate, erpUpdate, erpDelete } from './useErpApi';
import { S, Pagination, AiVerbsPanel, useConfirm, Modal } from './ErpShared';

const ENDPOINT = 'intercompany';
const AI_VERBS = [
  'detect-ic-mismatch','suggest-matching-key','predict-elimination-gap',
  'classify-ic-purpose','validate-transfer-pricing','generate-ic-confirmation',
  'recommend-netting','summarize-ic-volume','score-ic-process-health',
  'detect-stale-ic-balance','suggest-clean-up-batch','validate-tax-treatment',
  'classify-ic-recharge-method','predict-audit-finding','generate-ic-narrative',
  'explain-imbalance-cause',
];
const TX_TYPES = ['Sale','Purchase','Loan','Royalty','Management Fee','Dividend','Recharge'];
const MATCHING_STATUSES = ['Unmatched','Partial','Matched','Eliminated'];

function IcForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    transaction_id: '', from_entity_id: '', to_entity_id: '',
    transaction_type: 'Sale', currency_code: 'USD', amount: 0,
    matched_amount: 0, elimination_amount: 0, matching_status: 'Unmatched',
    ic_purpose: '', transfer_price: '', recharge_method: '',
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
        <div style={S.formGroup}><label style={S.label}>Transaction ID *</label>
          <input style={S.input} required value={form.transaction_id} onChange={e => set('transaction_id', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Transaction Type</label>
          <select style={S.input} value={form.transaction_type} onChange={e => set('transaction_type', e.target.value)}>
            {TX_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>From Entity ID *</label>
          <input type="number" style={S.input} required value={form.from_entity_id} onChange={e => set('from_entity_id', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>To Entity ID *</label>
          <input type="number" style={S.input} required value={form.to_entity_id} onChange={e => set('to_entity_id', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Currency</label>
          <input style={S.input} value={form.currency_code} onChange={e => set('currency_code', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Amount</label>
          <input type="number" step="0.0001" style={S.input} value={form.amount} onChange={e => set('amount', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Matched Amount</label>
          <input type="number" step="0.0001" style={S.input} value={form.matched_amount} onChange={e => set('matched_amount', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Matching Status</label>
          <select style={S.input} value={form.matching_status} onChange={e => set('matching_status', e.target.value)}>
            {MATCHING_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>IC Purpose</label>
          <input style={S.input} value={form.ic_purpose || ''} onChange={e => set('ic_purpose', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Transfer Price</label>
          <input type="number" step="0.0001" style={S.input} value={form.transfer_price || ''} onChange={e => set('transfer_price', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Recharge Method</label>
          <input style={S.input} value={form.recharge_method || ''} onChange={e => set('recharge_method', e.target.value)} />
        </div>
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
      <div style={S.grid3}>
        {['transaction_id','transaction_type','from_entity_id','to_entity_id','currency_code','amount','matched_amount','elimination_amount','balance','matching_key','matching_status','ic_purpose','recharge_method','transfer_price'].map(k => (
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

export default function IntercompanyPage() {
  const { data, pagination, loading, error, page, setPage, refresh } = useErpList(ENDPOINT);
  const { confirm, Dialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const matchColor = { Matched: 'green', Eliminated: 'green', Partial: 'yellow', Unmatched: 'red' };

  return (
    <div style={S.page}>
      <Dialog />
      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit IC Transaction' : 'New IC Transaction'} onClose={() => { setShowCreate(false); setEditing(null); }}>
          <IcForm initial={editing} onSave={() => { setShowCreate(false); setEditing(null); refresh(); }} onCancel={() => { setShowCreate(false); setEditing(null); }} />
        </Modal>
      )}
      {detail && (
        <Modal title={`IC Transaction Detail — ${detail}`} onClose={() => setDetail(null)}>
          <DetailPanel id={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>Intercompany Transactions</h1>
          <p style={S.sub}>Intercompany matching, elimination, transfer pricing, and netting</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>+ New Transaction</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : data.length === 0 ? <div style={S.empty}>No intercompany transactions found</div> : (
          <table style={S.table}>
            <thead>
              <tr>{['Tx ID','Type','From','To','Currency','Amount','Matched','Balance','Status','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td style={S.td}><span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{row.transaction_id}</span></td>
                  <td style={S.td}>{row.transaction_type}</td>
                  <td style={S.td}>{row.from_entity_id}</td>
                  <td style={S.td}>{row.to_entity_id}</td>
                  <td style={S.td}>{row.currency_code}</td>
                  <td style={S.td}>{Number(row.amount || 0).toLocaleString()}</td>
                  <td style={S.td}>{Number(row.matched_amount || 0).toLocaleString()}</td>
                  <td style={S.td}><span style={{ color: Number(row.balance || 0) === 0 ? '#10b981' : '#f87171' }}>{Number(row.balance || 0).toLocaleString()}</span></td>
                  <td style={S.td}><span style={S.badge(matchColor[row.matching_status] || 'blue')}>{row.matching_status}</span></td>
                  <td style={S.td}>
                    <div style={S.row}>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setDetail(row.id)}>View</button>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setEditing(row)}>Edit</button>
                      <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => confirm(`Delete transaction ${row.transaction_id}?`, async () => { await erpDelete(ENDPOINT, row.id); refresh(); })}>Del</button>
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
