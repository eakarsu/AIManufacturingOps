import React, { useState, useEffect } from 'react';
import { useErpList, erpGet, erpCreate, erpUpdate, erpDelete } from './useErpApi';
import { S, Pagination, AiVerbsPanel, useConfirm, Modal } from './ErpShared';

const ENDPOINT = 'cost-accounting';
const AI_VERBS = [
  'suggest-overhead-rate','detect-variance-root-cause','predict-month-end-variance',
  'classify-cost-driver','recommend-allocation-rule','validate-standard-cost',
  'generate-variance-narrative','summarize-cost-roll','predict-actual-vs-std',
  'score-costing-accuracy','suggest-pool-redesign','validate-absorption',
  'detect-distorted-allocation','classify-product-cost-leak','recommend-target-cost',
  'explain-margin-shift',
];
const COST_TYPES = ['Standard','Actual','Planned','Target'];

function CostForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    record_number: '', cost_type: 'Standard', sku: '', item_name: '',
    cost_center: '', fiscal_period: '', fiscal_year: new Date().getFullYear(),
    standard_cost: 0, actual_cost: 0, variance_amount: 0, variance_pct: 0,
    material_cost: 0, labor_cost: 0,
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
        <div style={S.formGroup}><label style={S.label}>Record Number *</label>
          <input style={S.input} required value={form.record_number} onChange={e => set('record_number', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Cost Type</label>
          <select style={S.input} value={form.cost_type} onChange={e => set('cost_type', e.target.value)}>
            {COST_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>SKU</label>
          <input style={S.input} value={form.sku || ''} onChange={e => set('sku', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Item Name</label>
          <input style={S.input} value={form.item_name || ''} onChange={e => set('item_name', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Cost Center</label>
          <input style={S.input} value={form.cost_center || ''} onChange={e => set('cost_center', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Fiscal Period</label>
          <input style={S.input} placeholder="2025-01" value={form.fiscal_period || ''} onChange={e => set('fiscal_period', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Fiscal Year</label>
          <input type="number" style={S.input} value={form.fiscal_year} onChange={e => set('fiscal_year', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Standard Cost</label>
          <input type="number" step="0.0001" style={S.input} value={form.standard_cost} onChange={e => set('standard_cost', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Actual Cost</label>
          <input type="number" step="0.0001" style={S.input} value={form.actual_cost} onChange={e => set('actual_cost', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Variance Amount</label>
          <input type="number" step="0.0001" style={S.input} value={form.variance_amount} onChange={e => set('variance_amount', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Material Cost</label>
          <input type="number" step="0.0001" style={S.input} value={form.material_cost} onChange={e => set('material_cost', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Labor Cost</label>
          <input type="number" step="0.0001" style={S.input} value={form.labor_cost} onChange={e => set('labor_cost', e.target.value)} />
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
        {['record_number','cost_type','sku','item_name','cost_center','fiscal_period','fiscal_year','standard_cost','actual_cost','variance_amount','variance_pct','material_cost','labor_cost'].map(k => (
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

export default function CostAccountingPage() {
  const { data, pagination, loading, error, page, setPage, refresh } = useErpList(ENDPOINT);
  const { confirm, Dialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  return (
    <div style={S.page}>
      <Dialog />
      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit Cost Record' : 'New Cost Record'} onClose={() => { setShowCreate(false); setEditing(null); }}>
          <CostForm initial={editing} onSave={() => { setShowCreate(false); setEditing(null); refresh(); }} onCancel={() => { setShowCreate(false); setEditing(null); }} />
        </Modal>
      )}
      {detail && (
        <Modal title={`Cost Record Detail — ${detail}`} onClose={() => setDetail(null)}>
          <DetailPanel id={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>Cost Accounting</h1>
          <p style={S.sub}>Standard vs actual costing, variance analysis, and overhead allocation</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>+ New Record</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : data.length === 0 ? <div style={S.empty}>No cost records found</div> : (
          <table style={S.table}>
            <thead>
              <tr>{['Record #','Type','SKU','Period','Std Cost','Actual Cost','Variance','Var %','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(row => {
                const varFav = Number(row.variance_amount || 0) <= 0;
                return (
                  <tr key={row.id}>
                    <td style={S.td}><span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{row.record_number}</span></td>
                    <td style={S.td}><span style={S.badge('blue')}>{row.cost_type}</span></td>
                    <td style={S.td}>{row.sku || '—'}</td>
                    <td style={S.td}>{row.fiscal_period || '—'}</td>
                    <td style={S.td}>{Number(row.standard_cost || 0).toFixed(2)}</td>
                    <td style={S.td}>{Number(row.actual_cost || 0).toFixed(2)}</td>
                    <td style={S.td}><span style={{ color: varFav ? '#10b981' : '#f87171' }}>{Number(row.variance_amount || 0).toFixed(2)}</span></td>
                    <td style={S.td}><span style={{ color: varFav ? '#10b981' : '#f87171' }}>{Number(row.variance_pct || 0).toFixed(2)}%</span></td>
                    <td style={S.td}>
                      <div style={S.row}>
                        <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setDetail(row.id)}>View</button>
                        <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setEditing(row)}>Edit</button>
                        <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => confirm(`Delete record ${row.record_number}?`, async () => { await erpDelete(ENDPOINT, row.id); refresh(); })}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination pagination={pagination} page={page} setPage={setPage} />
      </div>

      <AiVerbsPanel endpoint={ENDPOINT} verbs={AI_VERBS} />
    </div>
  );
}
