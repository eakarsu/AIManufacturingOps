import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchUsers(); }, [page, search]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/users`, { params: { page, limit: 20, search: search || undefined } });
      setUsers(res.data.data);
      setTotal(res.data.total);
    } catch (e) {
      console.error('Failed to load users');
    }
    setLoading(false);
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await axios.put(`${API_URL}/admin/users/${userId}/role`, { role: newRole });
      setMessage('Role updated successfully');
      fetchUsers();
      if (selectedUser?.id === userId) setSelectedUser({ ...selectedUser, role: newRole });
      setTimeout(() => setMessage(''), 2000);
    } catch (e) { setMessage(e.response?.data?.error || 'Failed to update role'); }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`);
      setMessage('User deleted');
      setSelectedUser(null);
      fetchUsers();
      setTimeout(() => setMessage(''), 2000);
    } catch (e) { setMessage(e.response?.data?.error || 'Failed to delete user'); }
  };

  const totalPages = Math.ceil(total / 20);

  if (selectedUser) {
    return (
      <div>
        <button className="back-btn" onClick={() => setSelectedUser(null)}>Back to Users</button>
        <div className="detail-section">
          <div className="detail-header">
            <h2>{selectedUser.name}</h2>
            <div className="detail-actions">
              <button className="btn-danger" onClick={() => handleDelete(selectedUser.id)}>Delete User</button>
            </div>
          </div>
          {message && <div className="success-message" style={{marginBottom:'16px'}}>{message}</div>}
          <div className="detail-grid">
            <div className="detail-item"><label>Email</label><div className="value">{selectedUser.email}</div></div>
            <div className="detail-item"><label>Department</label><div className="value">{selectedUser.department || 'N/A'}</div></div>
            <div className="detail-item"><label>Email Verified</label><div className="value">{selectedUser.email_verified ? 'Yes' : 'No'}</div></div>
            <div className="detail-item"><label>Joined</label><div className="value">{new Date(selectedUser.created_at).toLocaleDateString()}</div></div>
            <div className="detail-item">
              <label>Role</label>
              <select value={selectedUser.role} onChange={e => handleRoleChange(selectedUser.id, e.target.value)} className="form-select" style={{marginTop:'8px'}}>
                <option value="user">User</option>
                <option value="operator">Operator</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>Admin Panel - User Management</h2>
      {message && <div className="success-message" style={{marginBottom:'16px'}}>{message}</div>}
      <div className="data-section">
        <div className="section-header">
          <h3>Users ({total})</h3>
          <input type="text" placeholder="Search users..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="search-input" />
        </div>
        {loading ? <div className="ai-loading"><div className="spinner"></div></div> : (
          <>
            <table className="data-table" role="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Verified</th><th>Joined</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} onClick={() => setSelectedUser(u)}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td><span className={`status-badge status-${u.role === 'admin' ? 'active' : 'operational'}`}>{u.role}</span></td>
                    <td>{u.department || 'N/A'}</td>
                    <td>{u.email_verified ? 'Yes' : 'No'}</td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
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

export default AdminPanel;
