import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';

const ProductionThroughputChart = () => {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get('http://localhost:4103/api/custom-views/production-throughput');
      setData(r.data);
      setErr('');
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const colors = ['#22d3ee', '#f59e0b', '#a78bfa', '#34d399'];

  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: '#e2e8f0', margin: 0 }}>Production Throughput per Line (24h)</h3>
        <button onClick={load} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer' }}>Refresh</button>
      </div>
      {loading && <div style={{ color: '#94a3b8' }}>Loading...</div>}
      {err && <div style={{ color: '#fca5a5' }}>Error: {err}</div>}
      {data && (
        <>
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
            Unit: {data.unit} | Lines tracked: {data.lines.join(', ')}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Legend />
              {data.lines.map((line, i) => (
                <Line key={line} type="monotone" dataKey={line} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
};

export default ProductionThroughputChart;
