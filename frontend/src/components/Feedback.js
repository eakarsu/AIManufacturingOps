import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:4103/api';

const Feedback = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type:'general', subject:'', message:'', rating:5 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchFeedback(); }, [page, search]);

  const fetchFeedback = async () => {
    try {
      const res = await axios.get(`${API_URL}/feedback`, { params: { page, limit: 20, search: search || undefined } });
      setFeedbacks(res.data.data);
      setTotal(res.data.total);
    } catch (e) { console.error('Failed to load feedback'); }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/feedback`, form);
      setShowForm(false);
      setForm({ type:'general', subject:'', message:'', rating:5 });
      fetchFeedback();
    } catch (e) { console.error('Failed to submit feedback'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this feedback?')) return;
    try {
      await axios.delete(`${API_URL}/feedback/${id}`);
      setSelected(null);
      fetchFeedback();
    } catch (e) { console.error('Failed to delete'); }
  };

  const totalPages = Math.ceil(total / 20);
  const typeColors = { bug:'#f87171', feature:'#60a5fa', general:'#4ade80' };
  const statusColors = { pending:'status-pending', in_progress:'status-investigating', reviewed:'status-completed' };

  if (selected) {
    return (
      <div>
        <button className="back-btn" onClick={() => setSelected(null)}>Back to Feedback</button>
        <div className="detail-section">
          <div className="detail-header">
            <h2>{selected.subject}</h2>
            <div className="detail-actions">
              <button className="btn-danger" onClick={() => handleDelete(selected.id)}>Delete</button>
            </div>
          </div>
          <div className="detail-grid">
            <div className="detail-item"><label>Type</label><div className="value" style={{color:typeColors[selected.type]}}>{selected.type}</div></div>
            <div className="detail-item"><label>Rating</label><div className="value">{'★'.repeat(selected.rating || 0)}{'☆'.repeat(5-(selected.rating||0))}</div></div>
            <div className="detail-item"><label>Status</label><div className="value"><span className={`status-badge ${statusColors[selected.status]||''}`}>{selected.status}</span></div></div>
            <div className="detail-item"><label>Submitted By</label><div className="value">{selected.user_email}</div></div>
            <div className="detail-item"><label>Date</label><div className="value">{new Date(selected.created_at).toLocaleString()}</div></div>
          </div>
          <div style={{marginTop:'20px', padding:'16px', background:'rgba(255,255,255,0.05)', borderRadius:'12px'}}>
            <label style={{display:'block', fontSize:'12px', color:'#6b7280', marginBottom:'8px', textTransform:'uppercase'}}>Message</label>
            <p>{selected.message}</p>
          </div>
          {selected.admin_response && (
            <div style={{marginTop:'16px', padding:'16px', background:'rgba(99,102,241,0.1)', borderRadius:'12px', border:'1px solid rgba(99,102,241,0.3)'}}>
              <label style={{display:'block', fontSize:'12px', color:'#a5b4fc', marginBottom:'8px', textTransform:'uppercase'}}>Admin Response</label>
              <p>{selected.admin_response}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>Feedback</h2>
      <div className="data-section">
        <div className="section-header">
          <h3>All Feedback ({total})</h3>
          <div style={{display:'flex',gap:'12px'}}>
            <input type="text" placeholder="Search feedback..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className="search-input" />
            <button className="btn-primary" onClick={()=>setShowForm(!showForm)}>{showForm?'Cancel':'+ Submit Feedback'}</button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{marginBottom:'24px', padding:'20px', background:'rgba(255,255,255,0.05)', borderRadius:'12px'}}>
            <div className="form-row">
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="form-select">
                  <option value="general">General</option><option value="bug">Bug Report</option><option value="feature">Feature Request</option>
                </select>
              </div>
              <div className="form-group">
                <label>Rating</label>
                <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
                  {[1,2,3,4,5].map(r => (
                    <button key={r} type="button" onClick={()=>setForm({...form,rating:r})}
                      style={{background:'none',border:'none',fontSize:'24px',cursor:'pointer',color:r<=form.rating?'#fbbf24':'#4b5563'}}>
                      ★
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="form-group"><label>Subject</label><input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} required placeholder="Brief subject" /></div>
            <div className="form-group"><label>Message</label><textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} required placeholder="Describe your feedback..." rows={4}
              style={{width:'100%',padding:'14px 16px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'12px',color:'#fff',fontSize:'15px',resize:'vertical'}} /></div>
            <button type="submit" className="btn-primary">Submit Feedback</button>
          </form>
        )}

        {loading ? <div className="ai-loading"><div className="spinner"></div></div> : feedbacks.length === 0 ? (
          <div className="empty-state"><div className="icon">💬</div><h3>No feedback yet</h3></div>
        ) : (
          <>
            <table className="data-table" role="table">
              <thead><tr><th>Subject</th><th>Type</th><th>Rating</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {feedbacks.map(f => (
                  <tr key={f.id} onClick={()=>setSelected(f)}>
                    <td>{f.subject}</td>
                    <td><span style={{color:typeColors[f.type], fontWeight:500}}>{f.type}</span></td>
                    <td style={{color:'#fbbf24'}}>{'★'.repeat(f.rating||0)}</td>
                    <td><span className={`status-badge ${statusColors[f.status]||''}`}>{f.status}</span></td>
                    <td>{new Date(f.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="pagination">
                <button className="btn-secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button className="btn-secondary" disabled={page>=totalPages} onClick={()=>setPage(page+1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Feedback;
