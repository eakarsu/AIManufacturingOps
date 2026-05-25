import React, { useState } from 'react';

// === Batch 05 Gaps & Frontend Mounts ===
// Real Time
// Real-time WebSocket telemetry channel

export default function GapRealTime() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sampleRequests = [
      {
          "label": "Scenario",
          "value": "Run Real Time for a realistic customer case.\nContext: a team needs a practical recommendation based on incomplete operating data.\nGoal: identify the best action, key risks, missing information, and expected business impact.\nReturn: summary, prioritized action plan, assumptions, and follow-up questions."
      },
      {
          "label": "Data sample",
          "value": "Analyze this Real Time data sample.\nInput records:\n- Record 1: urgent, customer impact high, owner unassigned\n- Record 2: medium priority, blocked by missing data\n- Record 3: recurring issue, automation opportunity\nReturn structured findings, anomalies, recommendations, and confidence."
      },
      {
          "label": "Executive review",
          "value": "Prepare an executive review for Real Time.\nAudience: business owner, operations lead, and implementation team.\nInclude impact, risk, estimated effort, decision points, and a concise next-step plan."
      }
  ];

  const applySampleRequest = (value) => {
    setInput(value);
    setError(null);
    setResult(null);
  };
  const [history, setHistory] = useState([]);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/gap-real-time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ input, context: {} }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
      setHistory((prev) => [{ at: new Date().toISOString(), input, data }, ...prev].slice(0, 8));
    } catch (e) {
      setError(e.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Real Time</h1>
      <p style={{ color: '#555', marginBottom: 20 }}>Real-time WebSocket telemetry channel</p>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Input / Prompt</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {sampleRequests.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => applySampleRequest(sample.value)}
              style={{ padding: '6px 10px', background: '#eef2ff', color: '#1e3a8a', border: '1px solid #c7d2fe', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {sample.label}
            </button>
          ))}
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          style={{ width: '100%', padding: 10, border: '1px solid #d1d5db', borderRadius: 6, fontFamily: 'inherit' }}
          placeholder="Describe the scenario, paste data, or provide instructions..."
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button
            onClick={runAnalysis}
            disabled={loading || !input.trim()}
            style={{
              background: '#6366f1', color: 'white', border: 'none', padding: '10px 18px',
              borderRadius: 6, cursor: loading ? 'wait' : 'pointer', fontWeight: 600,
            }}
          >
            {loading ? 'Running...' : 'Run Real Time'}
          </button>
          <button
            onClick={() => { setInput(''); setResult(null); setError(null); }}
            style={{
              background: '#fff', color: '#374151', border: '1px solid #d1d5db', padding: '10px 18px',
              borderRadius: 6, cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Result</h3>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Recent runs</h3>
          {history.map((h, idx) => (
            <div key={idx} style={{ borderTop: idx ? '1px solid #f3f4f6' : 'none', padding: '10px 0' }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(h.at).toLocaleString()}</div>
              <div style={{ fontSize: 14, marginTop: 4 }}>{h.input.slice(0, 120)}{h.input.length > 120 ? '...' : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
