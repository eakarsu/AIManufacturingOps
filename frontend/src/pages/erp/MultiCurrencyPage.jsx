import React, { useState, useEffect } from 'react';
import { useErpList, erpGet, erpCreate, erpUpdate, erpDelete } from './useErpApi';
import { S, Pagination, AiVerbsPanel, useConfirm, Modal } from './ErpShared';

const ENDPOINT = 'multi-currency';
const AI_VERBS = [
  'predict-fx-impact','suggest-hedge-strategy','detect-fx-misposting',
  'classify-exposure-type','validate-revaluation','generate-fx-narrative',
  'recommend-functional-currency-change','summarize-fx-gain-loss',
  'score-translation-quality','detect-rate-anomaly','suggest-rate-source',
  'validate-historical-rate','classify-monetary-non-monetary',
  'predict-hedge-effectiveness','generate-hedge-doc','explain-translation-difference',
];
const RATE_TYPES = ['Spot','Average','Historical','Budget','Hedge'];

function RateForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    rate_id: '', from_currency: '', to_currency: 'USD', rate_type: 'Spot',
    exchange_rate: 1, rate_source: '', hedge_rate: '',
    hedge_effective: false, exposure_type: '',
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
        <div style={S.formGroup}><label style={S.label}>Rate ID *</label>
          <input style={S.input} required value={form.rate_id} onChange={e => set('rate_id', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Rate Type</label>
          <select style={S.input} value={form.rate_type} onChange={e => set('rate_type', e.target.value)}>
            {RATE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>From Currency *</label>
          <input style={S.input} required value={form.from_currency} onChange={e => set('from_currency', e.target.value)} placeholder="EUR" />
        </div>
        <div style={S.formGroup}><label style={S.label}>To Currency *</label>
          <input style={S.input} required value={form.to_currency} onChange={e => set('to_currency', e.target.value)} placeholder="USD" />
        </div>
        <div style={S.formGroup}><label style={S.label}>Exchange Rate *</label>
          <input type="number" step="0.00000001" style={S.input} required value={form.exchange_rate} onChange={e => set('exchange_rate', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Rate Source</label>
          <input style={S.input} value={form.rate_source || ''} onChange={e => set('rate_source', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Hedge Rate</label>
          <input type="number" step="0.00000001" style={S.input} value={form.hedge_rate || ''} onChange={e => set('hedge_rate', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Hedge Effective</label>
          <select style={S.input} value={String(form.hedge_effective)} onChange={e => set('hedge_effective', e.target.value === 'true')}>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>Exposure Type</label>
          <input style={S.input} value={form.exposure_type || ''} onChange={e => set('exposure_type', e.target.value)} placeholder="Transaction / Translation" />
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
        {['rate_id','from_currency','to_currency','rate_type','exchange_rate','rate_source','fx_gain_loss','revaluation_amount','hedge_rate','hedge_effective','exposure_type','is_active'].map(k => (
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

export default function MultiCurrencyPage() {
  const { data, pagination, loading, error, page, setPage, refresh } = useErpList(ENDPOINT);
  const { confirm, Dialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  return (
    <div style={S.page}>
      <Dialog />
      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit FX Rate' : 'New FX Rate'} onClose={() => { setShowCreate(false); setEditing(null); }}>
          <RateForm initial={editing} onSave={() => { setShowCreate(false); setEditing(null); refresh(); }} onCancel={() => { setShowCreate(false); setEditing(null); }} />
        </Modal>
      )}
      {detail && (
        <Modal title={`FX Rate Detail — ${detail}`} onClose={() => setDetail(null)}>
          <DetailPanel id={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>Multi-Currency / FX Rates</h1>
          <p style={S.sub}>Exchange rate management, revaluation, and hedge tracking</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>+ New Rate</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : data.length === 0 ? <div style={S.empty}>No FX rates found</div> : (
          <table style={S.table}>
            <thead>
              <tr>{['Rate ID','From','To','Type','Rate','Source','FX G/L','Hedge','Active','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td style={S.td}><span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{row.rate_id}</span></td>
                  <td style={S.td}><strong>{row.from_currency}</strong></td>
                  <td style={S.td}><strong>{row.to_currency}</strong></td>
                  <td style={S.td}>{row.rate_type}</td>
                  <td style={S.td}>{Number(row.exchange_rate || 0).toFixed(6)}</td>
                  <td style={S.td}>{row.rate_source || '—'}</td>
                  <td style={S.td}><span style={{ color: Number(row.fx_gain_loss || 0) >= 0 ? '#10b981' : '#f87171' }}>{Number(row.fx_gain_loss || 0).toFixed(2)}</span></td>
                  <td style={S.td}><span style={S.badge(row.hedge_effective ? 'green' : 'blue')}>{row.hedge_effective ? 'Yes' : 'No'}</span></td>
                  <td style={S.td}><span style={S.badge(row.is_active ? 'green' : 'red')}>{row.is_active ? 'Yes' : 'No'}</span></td>
                  <td style={S.td}>
                    <div style={S.row}>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setDetail(row.id)}>View</button>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setEditing(row)}>Edit</button>
                      <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => confirm(`Delete rate ${row.rate_id}?`, async () => { await erpDelete(ENDPOINT, row.id); refresh(); })}>Del</button>
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
