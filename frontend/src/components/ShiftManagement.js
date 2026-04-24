import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const emptyShift = { name:'', supervisor:'', start_time:'06:00', end_time:'14:00', department:'', workers_assigned:0, status:'scheduled', notes:'' };

const ShiftManagement = () => {
  const [shifts, setShifts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyShift);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchShifts(); }, [page, search]);

  const fetchShifts = async () => {
    try {
      const res = await axios.get(`${API_URL}/shifts`, { params: { page, limit: 20, search: search || undefined } });
      setShifts(res.data.data);
      setTotal(res.data.total);
    } catch (e) { console.error('Failed to load shifts'); }
    setLoading(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/shifts`, form);
      setShowModal(false);
      setForm(emptyShift);
      fetchShifts();
    } catch (e) { console.error('Failed to create shift'); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.put(`${API_URL}/shifts/${selected.id}`, form);
      setSelected(res.data);
      setEditing(false);
      fetchShifts();
    } catch (e) { console.error('Failed to update shift'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this shift?')) return;
    try {
      await axios.delete(`${API_URL}/shifts/${id}`);
      setSelected(null);
      fetchShifts();
    } catch (e) { console.error('Failed to delete shift'); }
  };

  const totalPages = Math.ceil(total / 20);
  const statusColors = { active:'status-active', scheduled:'status-pending', completed:'status-completed', cancelled:'status-critical' };

  if (selected && !showModal) {
    return (
      <div>
        <button className="back-btn" onClick={() => { setSelected(null); setEditing(false); }}>Back to Shifts</button>
        <div className="detail-section">
          <div className="detail-header">
            <h2>{selected.name}</h2>
            <div className="detail-actions">
              <button className="btn-primary" onClick={() => { setEditing(!editing); setForm(selected); }}>{editing ? 'Cancel' : 'Edit'}</button>
              <button className="btn-danger" onClick={() => handleDelete(selected.id)}>Delete</button>
            </div>
          </div>
          {editing ? (
            <form onSubmit={handleUpdate}>
              <div className="form-row">
                <div className="form-group"><label>Name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required /></div>
                <div className="form-group"><label>Supervisor</label><input value={form.supervisor} onChange={e=>setForm({...form,supervisor:e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Start Time</label><input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})} required /></div>
                <div className="form-group"><label>End Time</label><input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})} required /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Department</label><input value={form.department} onChange={e=>setForm({...form,department:e.target.value})} /></div>
                <div className="form-group"><label>Workers Assigned</label><input type="number" value={form.workers_assigned} onChange={e=>setForm({...form,workers_assigned:parseInt(e.target.value)||0})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Status</label>
                  <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="form-select">
                    <option value="scheduled">Scheduled</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="form-group"><label>Notes</label><input value={form.notes || ''} onChange={e=>setForm({...form,notes:e.target.value})} /></div>
              </div>
              <button type="submit" className="btn-primary">Save Changes</button>
            </form>
          ) : (
            <div className="detail-grid">
              <div className="detail-item"><label>Supervisor</label><div className="value">{selected.supervisor}</div></div>
              <div className="detail-item"><label>Start Time</label><div className="value">{selected.start_time}</div></div>
              <div className="detail-item"><label>End Time</label><div className="value">{selected.end_time}</div></div>
              <div className="detail-item"><label>Department</label><div className="value">{selected.department}</div></div>
              <div className="detail-item"><label>Workers</label><div className="value">{selected.workers_assigned}</div></div>
              <div className="detail-item"><label>Status</label><div className="value"><span className={`status-badge ${statusColors[selected.status]||''}`}>{selected.status}</span></div></div>
              <div className="detail-item" style={{gridColumn:'span 2'}}><label>Notes</label><div className="value">{selected.notes || 'No notes'}</div></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>Shift Management</h2>
      <div className="data-section">
        <div className="section-header">
          <h3>Shifts ({total})</h3>
          <div style={{display:'flex',gap:'12px'}}>
            <input type="text" placeholder="Search shifts..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className="search-input" />
            <button className="btn-primary" onClick={()=>{setForm(emptyShift);setShowModal(true);}}>+ Add Shift</button>
          </div>
        </div>
        {loading ? <div className="ai-loading"><div className="spinner"></div></div> : shifts.length === 0 ? (
          <div className="empty-state"><div className="icon">🕐</div><h3>No shifts</h3></div>
        ) : (
          <>
            <table className="data-table" role="table">
              <thead><tr><th>Name</th><th>Supervisor</th><th>Time</th><th>Department</th><th>Workers</th><th>Status</th></tr></thead>
              <tbody>
                {shifts.map(s => (
                  <tr key={s.id} onClick={()=>setSelected(s)}>
                    <td>{s.name}</td><td>{s.supervisor}</td><td>{s.start_time} - {s.end_time}</td>
                    <td>{s.department}</td><td>{s.workers_assigned}</td>
                    <td><span className={`status-badge ${statusColors[s.status]||''}`}>{s.status}</span></td>
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

      {showModal && (
        <div className="modal-overlay" onClick={()=>setShowModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h2>Add New Shift</h2><button className="modal-close" onClick={()=>setShowModal(false)}>x</button></div>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group"><label>Shift Name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required placeholder="e.g. Morning Shift A" /></div>
                <div className="form-group"><label>Supervisor</label><input value={form.supervisor} onChange={e=>setForm({...form,supervisor:e.target.value})} placeholder="Supervisor name" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Start Time</label><input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})} required /></div>
                <div className="form-group"><label>End Time</label><input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})} required /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Department</label><input value={form.department} onChange={e=>setForm({...form,department:e.target.value})} placeholder="e.g. Manufacturing" /></div>
                <div className="form-group"><label>Workers Assigned</label><input type="number" value={form.workers_assigned} onChange={e=>setForm({...form,workers_assigned:parseInt(e.target.value)||0})} /></div>
              </div>
              <div className="form-group"><label>Notes</label><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional notes" /></div>
              <div className="modal-footer"><button type="button" className="btn-secondary" onClick={()=>setShowModal(false)}>Cancel</button><button type="submit" className="btn-primary">Create Shift</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftManagement;
