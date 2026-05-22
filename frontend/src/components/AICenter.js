import React, { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const API_URL = 'http://localhost:4103/api';

const FEATURES = [
  {
    id: 'quality-defect-prediction',
    title: 'Quality Defect Prediction',
    desc: 'Predict likely defect modes for an upcoming batch using inspection + process data.',
    endpoint: '/ai/quality-defect-prediction',
    fields: [
      { key: 'product', label: 'Product', type: 'text', required: true },
      { key: 'batch_size', label: 'Batch Size', type: 'number' },
      { key: 'defect_history', label: 'Defect History (JSON)', type: 'json' },
      { key: 'inspection_results', label: 'Recent Inspections (JSON)', type: 'json' },
      { key: 'process_params', label: 'Process Parameters (JSON)', type: 'json' },
    ],
    resultKey: 'prediction',
  },
  {
    id: 'oee-anomaly-detection',
    title: 'OEE Anomaly Detection',
    desc: 'Compare current Availability/Performance/Quality against trend and surface anomalies.',
    endpoint: '/ai/oee-anomaly-detection',
    fields: [
      { key: 'line_id', label: 'Line ID', type: 'text' },
      { key: 'availability', label: 'Availability (%)', type: 'number' },
      { key: 'performance', label: 'Performance (%)', type: 'number' },
      { key: 'quality', label: 'Quality (%)', type: 'number' },
      { key: 'telemetry', label: 'Telemetry (JSON)', type: 'json' },
      { key: 'history', label: 'Trend History (JSON)', type: 'json' },
    ],
    resultKey: 'analysis',
  },
  {
    id: 'inventory-stockout-predict',
    title: 'Inventory Stockout Prediction',
    desc: 'Estimate days-to-stockout and reorder qty given on-hand, lead time, and demand history.',
    endpoint: '/ai/inventory-stockout-predict',
    fields: [
      { key: 'sku', label: 'SKU', type: 'text', required: true },
      { key: 'on_hand', label: 'On Hand (units)', type: 'number' },
      { key: 'lead_time_days', label: 'Lead Time (days)', type: 'number' },
      { key: 'safety_stock', label: 'Safety Stock', type: 'number' },
      { key: 'demand_history', label: 'Demand History (JSON)', type: 'json' },
      { key: 'pending_orders', label: 'Pending Orders (JSON)', type: 'json' },
    ],
    resultKey: 'prediction',
  },
];

function parseField(field, raw) {
  if (raw === '' || raw == null) return undefined;
  if (field.type === 'number') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (field.type === 'json') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

const AICenter = () => {
  const [activeTab, setActiveTab] = useState(FEATURES[0].id);
  const [forms, setForms] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  const setField = (fid, key, value) => {
    setForms((p) => ({ ...p, [fid]: { ...(p[fid] || {}), [key]: value } }));
  };

  const run = async (feature) => {
    setLoading((p) => ({ ...p, [feature.id]: true }));
    setResults((p) => ({ ...p, [feature.id]: null }));
    try {
      const payload = {};
      for (const f of feature.fields) {
        const v = parseField(f, (forms[feature.id] || {})[f.key]);
        if (v !== undefined) payload[f.key] = v;
      }
      const response = await axios.post(`${API_URL}${feature.endpoint}`, payload);
      setResults((p) => ({ ...p, [feature.id]: response.data }));
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error || err.message;
      setResults((p) => ({
        ...p,
        [feature.id]: {
          error: status === 503
            ? `AI provider not configured: ${message}`
            : message,
          status,
        },
      }));
    } finally {
      setLoading((p) => ({ ...p, [feature.id]: false }));
    }
  };

  const active = FEATURES.find((f) => f.id === activeTab) || FEATURES[0];
  const isLoading = loading[active.id];
  const result = results[active.id];

  return (
    <div>
      <div className="dashboard-header">
        <h2>AI Center</h2>
        <p>Specialized AI tools for quality, OEE, and inventory.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FEATURES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveTab(f.id)}
            className={activeTab === f.id ? 'btn btn-primary' : 'btn'}
            style={{ padding: '8px 14px' }}
          >
            {f.title}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>{active.title}</h3>
        <p style={{ color: '#64748b' }}>{active.desc}</p>

        <form
          onSubmit={(e) => { e.preventDefault(); run(active); }}
          style={{ display: 'grid', gap: 10 }}
        >
          {active.fields.map((f) => (
            <div key={f.key} className="form-group">
              <label>{f.label}{f.required ? ' *' : ''}</label>
              {f.type === 'json' ? (
                <textarea
                  rows={3}
                  value={(forms[active.id] || {})[f.key] || ''}
                  onChange={(e) => setField(active.id, f.key, e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12, width: '100%' }}
                />
              ) : (
                <input
                  type={f.type}
                  required={!!f.required}
                  value={(forms[active.id] || {})[f.key] || ''}
                  onChange={(e) => setField(active.id, f.key, e.target.value)}
                  style={{ width: '100%' }}
                />
              )}
            </div>
          ))}
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Running…' : 'Run AI'}
          </button>
        </form>

        {result && result.error && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: result.status === 503 ? '#fef3c7' : '#fee2e2',
              border: `1px solid ${result.status === 503 ? '#fbbf24' : '#fca5a5'}`,
              borderRadius: 6,
              color: '#991b1b',
            }}
          >
            {result.error}
          </div>
        )}
        {result && !result.error && (
          <div style={{ marginTop: 12 }}>
            {typeof result[active.resultKey] === 'string' ? (
              <ReactMarkdown>{result[active.resultKey]}</ReactMarkdown>
            ) : (
              <pre style={{ fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 6 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AICenter;
