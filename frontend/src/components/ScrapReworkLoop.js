import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:4103/api';
const emptyForm = { cell: '', defectCode: '', scrapUnits: 0, reworkUnits: 0, disposition: '', owner: '', status: 'containment' };

export default function ScrapReworkLoop() {
  const [loops, setLoops] = useState([]);
  const [summary, setSummary] = useState({ total: 0, scrapUnits: 0, reworkUnits: 0 });
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const res = await axios.get(`${API_URL}/scrap-rework-loop`);
    setLoops(res.data.loops || []);
    setSummary(res.data.summary || { total: 0, scrapUnits: 0, reworkUnits: 0 });
  };

  useEffect(() => { load(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    await axios.post(`${API_URL}/scrap-rework-loop`, form);
    setForm(emptyForm);
    load();
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Scrap Rework Loop</h1>
        <p>Disposition, containment, and rework load by production cell.</p>
      </div>
      <div className="stats-grid">
        {[
          ['Open Loops', summary.total],
          ['Scrap Units', summary.scrapUnits],
          ['Rework Units', summary.reworkUnits],
        ].map(([label, value]) => (
          <div className="stat-card" key={label}>
            <h3>{label}</h3>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
      <form className="card" onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {['cell', 'defectCode', 'disposition', 'owner'].map(field => (
          <input key={field} placeholder={field} value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} />
        ))}
        <input type="number" value={form.scrapUnits} onChange={e => setForm({ ...form, scrapUnits: e.target.value })} />
        <input type="number" value={form.reworkUnits} onChange={e => setForm({ ...form, reworkUnits: e.target.value })} />
        <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
          <option>containment</option><option>rework</option><option>root cause</option><option>closed</option>
        </select>
        <button className="btn-primary" type="submit">Add Loop</button>
      </form>
      <div className="card">
        <table className="data-table">
          <thead><tr>{['Cell', 'Defect', 'Scrap', 'Rework', 'Disposition', 'Owner', 'Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {loops.map(row => <tr key={row.id}><td>{row.cell}</td><td>{row.defectCode}</td><td>{row.scrapUnits}</td><td>{row.reworkUnits}</td><td>{row.disposition}</td><td>{row.owner}</td><td>{row.status}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
