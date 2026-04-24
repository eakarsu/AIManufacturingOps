import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchNotifications(); }, [page, search]);

  const fetchNotifications = async () => {
    try {
      const res = await axios.get(`${API_URL}/notifications`, { params: { page, limit: 20, search: search || undefined } });
      setNotifications(res.data.data);
      setTotal(res.data.total);
      setUnread(res.data.unread);
    } catch (e) { console.error('Failed to load notifications'); }
    setLoading(false);
  };

  const markAsRead = async (id) => {
    try {
      await axios.put(`${API_URL}/notifications/${id}/read`);
      fetchNotifications();
      if (selected?.id === id) setSelected({ ...selected, read: true });
    } catch (e) { console.error('Failed to mark as read'); }
  };

  const deleteNotification = async (id) => {
    try {
      await axios.delete(`${API_URL}/notifications/${id}`);
      setSelected(null);
      fetchNotifications();
    } catch (e) { console.error('Failed to delete'); }
  };

  const totalPages = Math.ceil(total / 20);

  const severityClass = (sev) => ({critical:'#f87171',high:'#fb923c',medium:'#fbbf24',low:'#4ade80'}[sev] || '#60a5fa');

  if (selected) {
    return (
      <div>
        <button className="back-btn" onClick={() => setSelected(null)}>Back to Notifications</button>
        <div className="detail-section">
          <div className="detail-header">
            <h2>{selected.title}</h2>
            <div className="detail-actions">
              {!selected.read && <button className="btn-primary" onClick={() => markAsRead(selected.id)}>Mark as Read</button>}
              <button className="btn-danger" onClick={() => deleteNotification(selected.id)}>Delete</button>
            </div>
          </div>
          <div className="detail-grid">
            <div className="detail-item"><label>Type</label><div className="value">{selected.type}</div></div>
            <div className="detail-item"><label>Severity</label><div className="value" style={{color: severityClass(selected.severity)}}>{selected.severity}</div></div>
            <div className="detail-item"><label>Status</label><div className="value">{selected.read ? 'Read' : 'Unread'}</div></div>
            <div className="detail-item"><label>Related Entity</label><div className="value">{selected.related_entity || 'N/A'} {selected.related_id ? `#${selected.related_id}` : ''}</div></div>
            <div className="detail-item"><label>Date</label><div className="value">{new Date(selected.created_at).toLocaleString()}</div></div>
          </div>
          <div style={{marginTop:'20px', padding:'16px', background:'rgba(255,255,255,0.05)', borderRadius:'12px'}}>
            <label style={{display:'block', fontSize:'12px', color:'#6b7280', marginBottom:'8px', textTransform:'uppercase'}}>Message</label>
            <p>{selected.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>Notifications {unread > 0 && <span className="nav-badge" style={{fontSize:'14px',marginLeft:'8px'}}>{unread} unread</span>}</h2>
      <div className="data-section">
        <div className="section-header">
          <h3>All Notifications ({total})</h3>
          <input type="text" placeholder="Search notifications..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="search-input" />
        </div>
        {loading ? <div className="ai-loading"><div className="spinner"></div></div> : notifications.length === 0 ? (
          <div className="empty-state"><div className="icon">🔔</div><h3>No notifications</h3><p>You're all caught up!</p></div>
        ) : (
          <>
            <table className="data-table" role="table">
              <thead><tr><th></th><th>Title</th><th>Type</th><th>Severity</th><th>Date</th></tr></thead>
              <tbody>
                {notifications.map(n => (
                  <tr key={n.id} onClick={() => { setSelected(n); if (!n.read) markAsRead(n.id); }} style={{fontWeight: n.read ? 'normal' : '600'}}>
                    <td>{n.read ? '' : '●'}</td>
                    <td>{n.title}</td>
                    <td><span className={`status-badge status-${n.type === 'alert' ? 'critical' : n.type === 'warning' ? 'warning' : 'operational'}`}>{n.type}</span></td>
                    <td style={{color: severityClass(n.severity)}}>{n.severity}</td>
                    <td>{new Date(n.created_at).toLocaleDateString()}</td>
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

export default Notifications;
