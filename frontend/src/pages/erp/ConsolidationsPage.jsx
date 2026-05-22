import React, { useState, useEffect } from 'react';
import { useErpList, erpGet, erpCreate, erpUpdate, erpDelete } from './useErpApi';
import { S, Pagination, AiVerbsPanel, useConfirm, Modal } from './ErpShared';

const ENDPOINT = 'consolidations';
const AI_VERBS = [
  'detect-elimination-miss','suggest-elimination-entry','validate-intercompany-match',
  'predict-consol-issue','generate-cta-narrative','classify-non-controlling-interest',
  'recommend-fx-rate-change','summarize-consolidation-result','detect-mapping-gap',
  'score-consolidation-readiness','suggest-entity-cleanup','validate-equity-pickup',
  'generate-board-package','predict-restatement-risk','classify-purchase-accounting-adj',
  'explain-period-variance',
];
const STATUSES = ['Draft','In Progress','Completed','Approved','Published'];
const METHODS = ['Full','Proportional','Equity'];

function ConsolidationForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    consolidation_id: '', consolidation_name: '', parent_entity_id: '',
    fiscal_period: '', fiscal_year: new Date().getFullYear(),
    reporting_currency: 'USD', status: 'Draft',
    consolidation_method: 'Full', ownership_pct: 100,
    minority_interest_pct: 0, total_revenue: 0, total_assets: 0,
    total_liabilities: 0, total_equity: 0,
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
        <div style={S.formGroup}><label style={S.label}>Consolidation ID *</label>
          <input style={S.input} required value={form.consolidation_id} onChange={e => set('consolidation_id', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Name</label>
          <input style={S.input} value={form.consolidation_name || ''} onChange={e => set('consolidation_name', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Parent Entity ID</label>
          <input type="number" style={S.input} value={form.parent_entity_id || ''} onChange={e => set('parent_entity_id', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Fiscal Period</label>
          <input style={S.input} placeholder="2025-Q1" value={form.fiscal_period || ''} onChange={e => set('fiscal_period', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Fiscal Year</label>
          <input type="number" style={S.input} value={form.fiscal_year} onChange={e => set('fiscal_year', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Reporting Currency</label>
          <input style={S.input} value={form.reporting_currency} onChange={e => set('reporting_currency', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Status</label>
          <select style={S.input} value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>Consolidation Method</label>
          <select style={S.input} value={form.consolidation_method} onChange={e => set('consolidation_method', e.target.value)}>
            {METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>Ownership %</label>
          <input type="number" style={S.input} value={form.ownership_pct} onChange={e => set('ownership_pct', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Minority Interest %</label>
          <input type="number" style={S.input} value={form.minority_interest_pct} onChange={e => set('minority_interest_pct', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Total Revenue</label>
          <input type="number" style={S.input} value={form.total_revenue} onChange={e => set('total_revenue', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Total Assets</label>
          <input type="number" style={S.input} value={form.total_assets} onChange={e => set('total_assets', e.target.value)} />
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
        {['consolidation_id','consolidation_name','fiscal_period','fiscal_year','reporting_currency','status','consolidation_method','ownership_pct','minority_interest_pct','total_revenue','total_assets','total_liabilities','total_equity'].map(k => (
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

export default function ConsolidationsPage() {
  const { data, pagination, loading, error, page, setPage, refresh } = useErpList(ENDPOINT);
  const { confirm, Dialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const statusColor = { Completed: 'green', Approved: 'green', Draft: 'blue', 'In Progress': 'yellow', Published: 'green' };

  return (
    <div style={S.page}>
      <Dialog />
      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit Consolidation' : 'New Consolidation'} onClose={() => { setShowCreate(false); setEditing(null); }}>
          <ConsolidationForm initial={editing} onSave={() => { setShowCreate(false); setEditing(null); refresh(); }} onCancel={() => { setShowCreate(false); setEditing(null); }} />
        </Modal>
      )}
      {detail && (
        <Modal title={`Consolidation Detail — ${detail}`} onClose={() => setDetail(null)}>
          <DetailPanel id={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>Consolidations</h1>
          <p style={S.sub}>Multi-entity financial consolidation, eliminations, and equity pickup</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>+ New Consolidation</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : data.length === 0 ? <div style={S.empty}>No consolidations found</div> : (
          <table style={S.table}>
            <thead>
              <tr>{['ID','Name','Period','Year','Currency','Method','Status','Revenue','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td style={S.td}><span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{row.consolidation_id}</span></td>
                  <td style={S.td}>{row.consolidation_name || '—'}</td>
                  <td style={S.td}>{row.fiscal_period || '—'}</td>
                  <td style={S.td}>{row.fiscal_year}</td>
                  <td style={S.td}>{row.reporting_currency}</td>
                  <td style={S.td}>{row.consolidation_method}</td>
                  <td style={S.td}><span style={S.badge(statusColor[row.status] || 'blue')}>{row.status}</span></td>
                  <td style={S.td}>{Number(row.total_revenue || 0).toLocaleString()}</td>
                  <td style={S.td}>
                    <div style={S.row}>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setDetail(row.id)}>View</button>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setEditing(row)}>Edit</button>
                      <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => confirm(`Delete consolidation ${row.consolidation_id}?`, async () => { await erpDelete(ENDPOINT, row.id); refresh(); })}>Del</button>
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
