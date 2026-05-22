import React, { useState, useEffect } from 'react';
import { useErpList, erpGet, erpCreate, erpUpdate, erpDelete } from './useErpApi';
import { S, Pagination, AiVerbsPanel, useConfirm, Modal } from './ErpShared';

const ENDPOINT = 'mrp';
const AI_VERBS = [
  'predict-demand','suggest-safety-stock','detect-supply-gap','classify-shortage-cause',
  'recommend-expedite','generate-planned-order','summarize-mrp-run','predict-late-delivery',
  'suggest-alternate-bom','score-mrp-stability','detect-pegging-conflict',
  'classify-action-message','validate-lead-time','recommend-supplier-shift',
  'predict-component-shortage','suggest-resource-shift',
];
const ORDER_TYPES = ['Planned','Firm','Released','Completed'];

function OrderForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    order_number: '', order_type: 'Planned', sku: '', item_name: '',
    demand_qty: 0, supply_qty: 0, on_hand_qty: 0, net_requirement: 0,
    lead_time_days: 0, safety_stock: 0, action_message: '', shortage_flag: false,
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
        <div style={S.formGroup}><label style={S.label}>Order Number *</label>
          <input style={S.input} required value={form.order_number} onChange={e => set('order_number', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Order Type</label>
          <select style={S.input} value={form.order_type} onChange={e => set('order_type', e.target.value)}>
            {ORDER_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.label}>SKU *</label>
          <input style={S.input} required value={form.sku} onChange={e => set('sku', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Item Name</label>
          <input style={S.input} value={form.item_name || ''} onChange={e => set('item_name', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Demand Qty</label>
          <input type="number" style={S.input} value={form.demand_qty} onChange={e => set('demand_qty', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Supply Qty</label>
          <input type="number" style={S.input} value={form.supply_qty} onChange={e => set('supply_qty', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Net Requirement</label>
          <input type="number" style={S.input} value={form.net_requirement} onChange={e => set('net_requirement', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Lead Time (days)</label>
          <input type="number" style={S.input} value={form.lead_time_days} onChange={e => set('lead_time_days', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Safety Stock</label>
          <input type="number" style={S.input} value={form.safety_stock} onChange={e => set('safety_stock', e.target.value)} />
        </div>
        <div style={S.formGroup}><label style={S.label}>Action Message</label>
          <input style={S.input} value={form.action_message || ''} onChange={e => set('action_message', e.target.value)} />
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
        {['order_number','order_type','sku','item_name','demand_qty','supply_qty','on_hand_qty','net_requirement','lead_time_days','safety_stock','shortage_flag','action_message'].map(k => (
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

export default function MrpPage() {
  const { data, pagination, loading, error, page, setPage, refresh } = useErpList(ENDPOINT);
  const { confirm, Dialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const typeColor = { Planned: 'blue', Firm: 'yellow', Released: 'green', Completed: 'green' };

  return (
    <div style={S.page}>
      <Dialog />
      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit MRP Order' : 'New MRP Order'} onClose={() => { setShowCreate(false); setEditing(null); }}>
          <OrderForm initial={editing} onSave={() => { setShowCreate(false); setEditing(null); refresh(); }} onCancel={() => { setShowCreate(false); setEditing(null); }} />
        </Modal>
      )}
      {detail && (
        <Modal title={`MRP Order Detail — ${detail}`} onClose={() => setDetail(null)}>
          <DetailPanel id={detail} onClose={() => setDetail(null)} />
        </Modal>
      )}

      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>Material Requirements Planning</h1>
          <p style={S.sub}>Planned orders, demand vs supply, shortage detection</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>+ New Order</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : data.length === 0 ? <div style={S.empty}>No MRP orders found</div> : (
          <table style={S.table}>
            <thead>
              <tr>{['Order #','Type','SKU','Item Name','Demand','Supply','Net Req.','Shortage','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td style={S.td}><span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{row.order_number}</span></td>
                  <td style={S.td}><span style={S.badge(typeColor[row.order_type] || 'blue')}>{row.order_type}</span></td>
                  <td style={S.td}>{row.sku}</td>
                  <td style={S.td}>{row.item_name || '—'}</td>
                  <td style={S.td}>{Number(row.demand_qty || 0).toLocaleString()}</td>
                  <td style={S.td}>{Number(row.supply_qty || 0).toLocaleString()}</td>
                  <td style={S.td}>{Number(row.net_requirement || 0).toLocaleString()}</td>
                  <td style={S.td}><span style={S.badge(row.shortage_flag ? 'red' : 'green')}>{row.shortage_flag ? 'Yes' : 'No'}</span></td>
                  <td style={S.td}>
                    <div style={S.row}>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setDetail(row.id)}>View</button>
                      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} onClick={() => setEditing(row)}>Edit</button>
                      <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => confirm(`Delete order ${row.order_number}?`, async () => { await erpDelete(ENDPOINT, row.id); refresh(); })}>Del</button>
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
