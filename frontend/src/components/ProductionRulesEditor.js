import React, { useEffect, useState } from 'react';
import axios from 'axios';

const empty = {
  line_id: '',
  line_name: '',
  capacity_per_hour: 100,
  changeover_minutes: 30,
  changeover_from: '',
  changeover_to: '',
  notes: ''
};

const ProductionRulesEditor = () => {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await axios.get('http://localhost:4103/api/custom-views/production-rules');
      setItems(r.data.items || []);
      setErr('');
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await axios.put(`http://localhost:4103/api/custom-views/production-rules/${editingId}`, draft);
      } else {
        await axios.post('http://localhost:4103/api/custom-views/production-rules', draft);
      }
      setDraft(empty);
      setEditingId(null);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const edit = (rec) => { setDraft(rec); setEditingId(rec.id); };
  const cancel = () => { setDraft(empty); setEditingId(null); };
  const del = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    await axios.delete(`http://localhost:4103/api/custom-views/production-rules/${id}`);
    await load();
  };

  const inp = { padding: 6, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, width: '100%' };

  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ color: '#e2e8f0', marginTop: 0 }}>Production Rules Editor</h3>
      {err && <div style={{ color: '#fca5a5', marginBottom: 8 }}>Error: {err}</div>}

      <form onSubmit={submit} style={{ background: '#0f172a', padding: 12, borderRadius: 6, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <div>
            <label style={{ color: '#94a3b8', fontSize: 11 }}>Line ID</label>
            <input style={inp} value={draft.line_id} onChange={(e) => setDraft({ ...draft, line_id: e.target.value })} required />
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: 11 }}>Line Name</label>
            <input style={inp} value={draft.line_name} onChange={(e) => setDraft({ ...draft, line_name: e.target.value })} required />
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: 11 }}>Capacity/hr</label>
            <input style={inp} type="number" value={draft.capacity_per_hour} onChange={(e) => setDraft({ ...draft, capacity_per_hour: e.target.value })} required />
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: 11 }}>Changeover (min)</label>
            <input style={inp} type="number" value={draft.changeover_minutes} onChange={(e) => setDraft({ ...draft, changeover_minutes: e.target.value })} required />
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: 11 }}>Changeover From</label>
            <input style={inp} value={draft.changeover_from} onChange={(e) => setDraft({ ...draft, changeover_from: e.target.value })} />
          </div>
          <div>
            <label style={{ color: '#94a3b8', fontSize: 11 }}>Changeover To</label>
            <input style={inp} value={draft.changeover_to} onChange={(e) => setDraft({ ...draft, changeover_to: e.target.value })} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ color: '#94a3b8', fontSize: 11 }}>Notes</label>
            <input style={inp} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}>
            {editingId ? 'Update Rule' : 'Add Rule'}
          </button>
          {editingId && (
            <button type="button" onClick={cancel} style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
          )}
        </div>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e2e8f0', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#0f172a' }}>
            <th style={{ padding: 8, textAlign: 'left' }}>Line</th>
            <th style={{ padding: 8, textAlign: 'right' }}>Cap/hr</th>
            <th style={{ padding: 8, textAlign: 'right' }}>CO min</th>
            <th style={{ padding: 8, textAlign: 'left' }}>From → To</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Notes</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #334155' }}>
              <td style={{ padding: 8 }}>{r.line_name}<div style={{ color: '#64748b', fontSize: 11 }}>{r.line_id}</div></td>
              <td style={{ padding: 8, textAlign: 'right' }}>{r.capacity_per_hour}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{r.changeover_minutes}</td>
              <td style={{ padding: 8 }}>{r.changeover_from} → {r.changeover_to}</td>
              <td style={{ padding: 8, color: '#94a3b8' }}>{r.notes}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>
                <button onClick={() => edit(r)} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', marginRight: 4, cursor: 'pointer' }}>Edit</button>
                <button onClick={() => del(r.id)} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProductionRulesEditor;
