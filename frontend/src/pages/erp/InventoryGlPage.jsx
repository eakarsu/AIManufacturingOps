import React, { useState, useEffect } from 'react';
import { useErpList, erpGet, erpCreate, erpUpdate, erpDelete } from './useErpApi';
import { S, Pagination, AiVerbsPanel, useConfirm, Modal } from './ErpShared';

const ENDPOINT = 'inventory-gl';
const AI_VERBS = [
  'suggest-valuation-method','detect-cogs-discrepancy','classify-slow-mover',
  'predict-write-down','recommend-cycle-count','validate-inventory-cutoff',
  'generate-reserve-recommendation','detect-shrinkage','suggest-reorder-point',
  'summarize-on-hand-changes','predict-stockout','classify-abc-tier',
  'validate-costing-run','recommend-revaluation','detect-negative-on-hand',
  'score-inventory-quality',
];
const VALUATION_METHODS = ['WAC','FIFO','LIFO','Standard'];
const ABC_TIERS = ['A','B','C'];

function ItemForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    sku: '', item_name: '', item_category: '', valuation_method: 'WAC',
    warehouse_code: '', on_hand_qty: 0, unit_cost: 0, total_value: 0,
    abc_tier: 'B', reorder_point: 0, currency_code: 'USD',
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
        <div style={S.formGroup}><label style={S.label}>SKU *</label>
          <input style={S.input} required value={form.sku} onChange={e => set('sku', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Item Name *</label>
          <input style={S.input} required value={form.item_name} onChange={e => set('item_name', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Category</label>
          <input style={S.input} value={form.item_category || ''} onChange={e => set('item_category', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Valuation Method</label>
          <select style={S.input} value={form.valuation_method} onChange={e => set('valuation_method', e.target.value)}>
            {VALUATION_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>Warehouse Code</label>
          <input style={S.input} value={form.warehouse_code || ''} onChange={e => set('warehouse_code', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>ABC Tier</label>
          <select style={S.input} value={form.abc_tier || 'B'} onChange={e => set('abc_tier', e.target.value)}>
            {ABC_TIERS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>On Hand Qty</label>
          <input type="number" style={S.input} value={form.on_hand_qty} onChange={e => set('on_hand_qty', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Unit Cost</label>
          <input type="number" step="0.0001" style={S.input} value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Reorder Point</label>
          <input type="number" style={S.input} value={form.reorder_point || 0} onChange={e => set('reorder_point', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Currency</label>
          <input style={S.input} value={form.currency_code} onChange={e => set('currency_code', e.target.value)} />
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
        {['sku','item_name','item_category','valuation_method','warehouse_code','on_hand_qty','unit_cost','total_value','cogs_ytd','abc_tier','reorder_point','slow_mover_flag'].map(k => (
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

export default function InventoryGlPage() {
  const { data, pagination, loading, error, page, setPage, refresh } = useErpList(ENDPOINT);
  const { confirm, Dialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const abcColor = { A: 'green', B: 'yellow', C: 'red' };

  return (
    <div style={S.page}>
      <Dialog />
      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit Inventory Item' : 'New Inventory Item'} onClose={() => { setShowCreate(false); setEditing(null); }}>
          <ItemForm initial={editing} onSave={() => { setShowCreate(false); setEditing(null); refresh(); }} onCancel={() => { setShowCreate(false); setEditing(null); }} />
        </Modal>
      )}
      {detail && (
        <Modal title={`Inventory Detail — ${detail}`} onClose={() => setDetail(null)}>
          <DetailPanel id={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>Inventory GL</h1>
          <p style={S.sub}>Inventory valuation, COGS tracking, and GL reconciliation</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>+ New Item</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : data.length === 0 ? <div style={S.empty}>No inventory items found</div> : (
          <table style={S.table}>
            <thead>
              <tr>{['SKU','Name','Category','Method','On Hand','Unit Cost','Total Value','ABC','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td style={S.td}><span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{row.sku}</span></td>
                  <td style={S.td}>{row.item_name}</td>
                  <td style={S.td}>{row.item_category || '—'}</td>
                  <td style={S.td}>{row.valuation_method}</td>
                  <td style={S.td}>{Number(row.on_hand_qty || 0).toLocaleString()}</td>
                  <td style={S.td}>{Number(row.unit_cost || 0).toFixed(4)}</td>
                  <td style={S.td}>{Number(row.total_value || 0).toLocaleString()}</td>
                  <td style={S.td}><span style={S.badge(abcColor[row.abc_tier] || 'blue')}>{row.abc_tier || '—'}</span></td>
                  <td style={S.td}>
                    <div style={S.row}>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setDetail(row.id)}>View</button>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setEditing(row)}>Edit</button>
                      <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => confirm(`Delete ${row.sku}?`, async () => { await erpDelete(ENDPOINT, row.id); refresh(); })}>Del</button>
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
