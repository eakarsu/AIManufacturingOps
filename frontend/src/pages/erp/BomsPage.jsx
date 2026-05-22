import React, { useState, useEffect } from 'react';
import { useErpList, erpGet, erpCreate, erpUpdate, erpDelete } from './useErpApi';
import { S, Pagination, AiVerbsPanel, useConfirm, Modal } from './ErpShared';

const ENDPOINT = 'boms';
const AI_VERBS = [
  'detect-bom-circularity','suggest-component-substitute','predict-bom-cost',
  'classify-bom-revision-impact','validate-routing-steps','generate-bom-narrative',
  'detect-orphan-components','recommend-engineering-change','score-bom-maturity',
  'summarize-bom-changes','predict-revision-rollout','suggest-phantom-bom',
  'validate-yield','classify-make-vs-buy','detect-redundant-operation','recommend-bom-cleanup',
];
const BOM_TYPES = ['Manufacturing','Engineering','Sales','Service'];
const STATUSES = ['Active','Draft','Obsolete','Under Review'];
const MAKE_VS_BUY = ['Make','Buy','Either'];

function BomForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    bom_number: '', parent_sku: '', parent_name: '', revision: '1.0',
    status: 'Active', bom_type: 'Manufacturing', standard_cost: 0,
    make_vs_buy: 'Make', yield_pct: 100, phantom_bom: false,
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
        <div style={S.formGroup}><label style={S.label}>BOM Number *</label>
          <input style={S.input} required value={form.bom_number} onChange={e => set('bom_number', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Parent SKU *</label>
          <input style={S.input} required value={form.parent_sku} onChange={e => set('parent_sku', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Parent Name</label>
          <input style={S.input} value={form.parent_name || ''} onChange={e => set('parent_name', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Revision</label>
          <input style={S.input} value={form.revision} onChange={e => set('revision', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Status</label>
          <select style={S.input} value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>BOM Type</label>
          <select style={S.input} value={form.bom_type} onChange={e => set('bom_type', e.target.value)}>
            {BOM_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>Standard Cost</label>
          <input type="number" step="0.0001" style={S.input} value={form.standard_cost} onChange={e => set('standard_cost', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Make vs Buy</label>
          <select style={S.input} value={form.make_vs_buy} onChange={e => set('make_vs_buy', e.target.value)}>
            {MAKE_VS_BUY.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>Yield %</label>
          <input type="number" style={S.input} value={form.yield_pct} onChange={e => set('yield_pct', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Phantom BOM</label>
          <select style={S.input} value={String(form.phantom_bom)} onChange={e => set('phantom_bom', e.target.value === 'true')}>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
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
        {['bom_number','parent_sku','parent_name','revision','status','bom_type','standard_cost','make_vs_buy','yield_pct','phantom_bom','component_count','routing_steps'].map(k => (
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

export default function BomsPage() {
  const { data, pagination, loading, error, page, setPage, refresh } = useErpList(ENDPOINT);
  const { confirm, Dialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const statusColor = { Active: 'green', Draft: 'blue', Obsolete: 'red', 'Under Review': 'yellow' };

  return (
    <div style={S.page}>
      <Dialog />
      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit BOM' : 'New BOM'} onClose={() => { setShowCreate(false); setEditing(null); }}>
          <BomForm initial={editing} onSave={() => { setShowCreate(false); setEditing(null); refresh(); }} onCancel={() => { setShowCreate(false); setEditing(null); }} />
        </Modal>
      )}
      {detail && (
        <Modal title={`BOM Detail — ${detail}`} onClose={() => setDetail(null)}>
          <DetailPanel id={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>Bills of Materials</h1>
          <p style={S.sub}>BOM structure, revisions, routing steps, and cost analysis</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>+ New BOM</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : data.length === 0 ? <div style={S.empty}>No BOMs found</div> : (
          <table style={S.table}>
            <thead>
              <tr>{['BOM #','Parent SKU','Parent Name','Rev.','Type','Status','Std Cost','Yield %','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td style={S.td}><span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{row.bom_number}</span></td>
                  <td style={S.td}>{row.parent_sku}</td>
                  <td style={S.td}>{row.parent_name || '—'}</td>
                  <td style={S.td}>{row.revision}</td>
                  <td style={S.td}>{row.bom_type}</td>
                  <td style={S.td}><span style={S.badge(statusColor[row.status] || 'blue')}>{row.status}</span></td>
                  <td style={S.td}>{Number(row.standard_cost || 0).toFixed(2)}</td>
                  <td style={S.td}>{row.yield_pct}%</td>
                  <td style={S.td}>
                    <div style={S.row}>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setDetail(row.id)}>View</button>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setEditing(row)}>Edit</button>
                      <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => confirm(`Delete BOM ${row.bom_number}?`, async () => { await erpDelete(ENDPOINT, row.id); refresh(); })}>Del</button>
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
