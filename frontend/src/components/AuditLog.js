import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:4103/api';

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLogs(); }, [page, search, actionFilter]);

  const fetchLogs = async () => {
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (actionFilter) params.action = actionFilter;
      const res = await axios.get(`${API_URL}/audit-logs`, { params });
      setLogs(res.data.data);
      setTotal(res.data.total);
    } catch (e) { console.error('Failed to load audit logs'); }
    setLoading(false);
  };

  const totalPages = Math.ceil(total / 20);
  const actionColors = { LOGIN:'#60a5fa', CREATE:'#4ade80', UPDATE:'#fbbf24', DELETE:'#f87171', CHANGE_ROLE:'#a78bfa', EXPORT:'#34d399', UPLOAD:'#38bdf8', PASSWORD_RESET:'#fb923c', UPDATE_PROFILE:'#818cf8' };

  if (selected) {
    return (
      <div>
        <button className="back-btn" onClick={() => setSelected(null)}>Back to Audit Logs</button>
        <div className="detail-section">
          <div className="detail-header">
            <h2>Audit Log #{selected.id}</h2>
          </div>
          <div className="detail-grid">
            <div className="detail-item"><label>Action</label><div className="value" style={{color: actionColors[selected.action] || '#e4e4e7'}}>{selected.action}</div></div>
            <div className="detail-item"><label>User</label><div className="value">{selected.user_email}</div></div>
            <div className="detail-item"><label>Entity Type</label><div className="value">{selected.entity_type || 'N/A'}</div></div>
            <div className="detail-item"><label>Entity ID</label><div className="value">{selected.entity_id || 'N/A'}</div></div>
            <div className="detail-item"><label>IP Address</label><div className="value">{selected.ip_address || 'N/A'}</div></div>
            <div className="detail-item"><label>Date</label><div className="value">{new Date(selected.created_at).toLocaleString()}</div></div>
          </div>
          <div style={{marginTop:'20px', padding:'16px', background:'rgba(255,255,255,0.05)', borderRadius:'12px'}}>
            <label style={{display:'block', fontSize:'12px', color:'#6b7280', marginBottom:'8px', textTransform:'uppercase'}}>Details</label>
            <p>{selected.details}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>Audit Log</h2>
      <div className="data-section">
        <div className="section-header">
          <h3>Activity Log ({total})</h3>
          <div style={{display:'flex', gap:'12px'}}>
            <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} className="form-select" style={{minWidth:'150px'}}>
              <option value="">All Actions</option>
              {['LOGIN','CREATE','UPDATE','DELETE','CHANGE_ROLE','EXPORT','UPLOAD','PASSWORD_RESET','UPDATE_PROFILE'].map(a =>
                <option key={a} value={a}>{a}</option>
              )}
            </select>
            <input type="text" placeholder="Search logs..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="search-input" />
          </div>
        </div>
        {loading ? <div className="ai-loading"><div className="spinner"></div></div> : logs.length === 0 ? (
          <div className="empty-state"><div className="icon">📋</div><h3>No audit logs</h3></div>
        ) : (
          <>
            <table className="data-table" role="table">
              <thead><tr><th>Action</th><th>User</th><th>Entity</th><th>Details</th><th>IP</th><th>Date</th></tr></thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} onClick={() => setSelected(log)}>
                    <td><span style={{color: actionColors[log.action] || '#e4e4e7', fontWeight:600}}>{log.action}</span></td>
                    <td>{log.user_email}</td>
                    <td>{log.entity_type} {log.entity_id ? `#${log.entity_id}` : ''}</td>
                    <td style={{maxWidth:'250px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{log.details}</td>
                    <td>{log.ip_address}</td>
                    <td>{new Date(log.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="pagination">
                <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
