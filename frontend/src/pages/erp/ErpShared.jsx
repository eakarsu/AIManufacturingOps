import React, { useState } from 'react';
import { erpAi } from './useErpApi';

/* ── Styles ──────────────────────────────────────────────────────────────── */
export const S = {
  page: { padding: 28, maxWidth: 1400, margin: '0 auto' },
  header: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  sub: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '10px 12px', background: 'rgba(99,102,241,0.12)',
    color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12,
    textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', verticalAlign: 'top' },
  btn: {
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: 13, transition: 'all .2s',
  },
  btnPrimary: { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' },
  btnSecondary: { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' },
  btnDanger: { background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' },
  btnSm: { padding: '5px 10px', fontSize: 12 },
  input: {
    width: '100%', padding: '10px 12px', background: 'var(--bg-input)',
    border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-primary)',
    fontSize: 14, outline: 'none',
  },
  label: { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' },
  formGroup: { marginBottom: 16 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  badge: (color) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
    background: color === 'green' ? 'rgba(16,185,129,.18)' : color === 'red' ? 'rgba(248,113,113,.18)' : color === 'yellow' ? 'rgba(251,191,36,.18)' : 'rgba(99,102,241,.18)',
    color: color === 'green' ? '#10b981' : color === 'red' ? '#f87171' : color === 'yellow' ? '#fbbf24' : '#a5b4fc',
  }),
  aiBox: {
    background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 10, padding: 14, marginTop: 10,
  },
  aiResult: {
    background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(99,102,241,0.15)',
    borderRadius: 8, padding: 14, marginTop: 10, fontSize: 13, whiteSpace: 'pre-wrap',
    color: 'var(--text-primary)', maxHeight: 300, overflowY: 'auto',
  },
  pagination: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 },
  empty: { padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 },
  errorBox: { background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, padding: 12, color: '#f87171', fontSize: 13, marginBottom: 12 },
};

/* ── Pagination bar ──────────────────────────────────────────────────────── */
export function Pagination({ pagination, page, setPage }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <div style={S.pagination}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {pagination.total} records
      </span>
      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{page} / {pagination.totalPages}</span>
      <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSm }} disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
    </div>
  );
}

/* ── AI Verbs Panel ──────────────────────────────────────────────────────── */
export function AiVerbsPanel({ endpoint, verbs }) {
  const [selected, setSelected] = useState(verbs[0] || '');
  const [body, setBody] = useState('{}');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      let parsedBody = {};
      try { parsedBody = JSON.parse(body); } catch (_) {}
      const res = await erpAi(endpoint, selected, parsedBody);
      setResult(res);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.card}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
        🤖 AI Verbs ({verbs.length})
      </h3>
      <div style={S.grid2}>
        <div style={S.formGroup}>
          <label style={S.label}>Select AI Verb</label>
          <select value={selected} onChange={e => setSelected(e.target.value)} style={{ ...S.input }}>
            {verbs.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Request Body (JSON)</label>
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            style={S.input}
            placeholder='{}'
          />
        </div>
      </div>
      <button
        style={{ ...S.btn, ...S.btnPrimary }}
        onClick={run}
        disabled={loading}
      >
        {loading ? 'Running…' : `Run: ${selected}`}
      </button>
      {error && <div style={{ ...S.errorBox, marginTop: 10 }}>{error}</div>}
      {result && (
        <div style={S.aiBox}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Model: {result.model || '—'} · Success: {result.success ? '✓' : '✗'}
          </div>
          <div style={S.aiResult}>
            {typeof result.result === 'object'
              ? JSON.stringify(result.result, null, 2)
              : result.result || result.content || '(no result)'}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Generic confirm dialog ──────────────────────────────────────────────── */
export function useConfirm() {
  const [pending, setPending] = useState(null);
  function confirm(msg, onYes) { setPending({ msg, onYes }); }
  function Dialog() {
    if (!pending) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
        <div style={{ background: '#1e1e3f', border: '1px solid var(--border-color)', borderRadius: 14, padding: 28, maxWidth: 380, width: '90%' }}>
          <p style={{ color: 'var(--text-primary)', marginBottom: 20 }}>{pending.msg}</p>
          <div style={S.row}>
            <button style={{ ...S.btn, ...S.btnDanger }} onClick={() => { pending.onYes(); setPending(null); }}>Confirm</button>
            <button style={{ ...S.btn, ...S.btnSecondary }} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }
  return { confirm, Dialog };
}

/* ── Modal wrapper ───────────────────────────────────────────────────────── */
export function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 998, padding: 16 }}>
      <div style={{ background: '#1a1a3e', border: '1px solid var(--border-color)', borderRadius: 16, padding: 28, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
