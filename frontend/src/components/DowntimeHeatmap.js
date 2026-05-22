import React, { useEffect, useState } from 'react';
import axios from 'axios';

const DowntimeHeatmap = () => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get('http://localhost:4103/api/custom-views/downtime-heatmap');
      setData(r.data);
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const colorFor = (mins, max) => {
    const t = max ? mins / max : 0;
    // green -> yellow -> red
    const r = Math.round(34 + (220 - 34) * t);
    const g = Math.round(197 - (197 - 38) * t);
    const b = Math.round(94 - (94 - 38) * t);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: '#e2e8f0', margin: 0 }}>Downtime Heatmap (Line x Shift)</h3>
        <button onClick={load} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer' }}>Refresh</button>
      </div>
      {loading && <div style={{ color: '#94a3b8' }}>Loading...</div>}
      {err && <div style={{ color: '#fca5a5' }}>Error: {err}</div>}
      {data && (
        <>
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
            Max downtime: {data.max_minutes} min | Cells: {data.cells.length}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e2e8f0' }}>
            <thead>
              <tr>
                <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #334155' }}>Line</th>
                {data.shifts.map((s) => (
                  <th key={s} style={{ padding: 8, textAlign: 'center', borderBottom: '1px solid #334155', fontSize: 12 }}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{line}</td>
                  {data.shifts.map((shift) => {
                    const cell = data.cells.find((c) => c.line === line && c.shift === shift);
                    return (
                      <td key={shift} style={{ padding: 4, textAlign: 'center' }}>
                        <div
                          title={`${cell.downtime_minutes} min - ${cell.top_reason}`}
                          style={{
                            background: colorFor(cell.downtime_minutes, data.max_minutes),
                            color: '#0f172a',
                            padding: '12px 8px',
                            borderRadius: 4,
                            fontWeight: 600
                          }}
                        >
                          {cell.downtime_minutes}m
                          <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2 }}>{cell.top_reason}</div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default DowntimeHeatmap;
