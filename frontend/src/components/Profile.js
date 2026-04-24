import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', department: '' });
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const res = await axios.get(`${API_URL}/auth/me`);
      setUser(res.data);
      setForm({ name: res.data.name || '', phone: res.data.phone || '', department: res.data.department || '' });
    } catch (e) { setError('Failed to load profile'); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      const res = await axios.put(`${API_URL}/auth/profile`, form);
      setUser(res.data);
      setMessage('Profile updated successfully');
      setEditing(false);
    } catch (e) { setError(e.response?.data?.error || 'Update failed'); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(''); setPwMessage('');
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    try {
      await axios.put(`${API_URL}/auth/change-password`, {
        oldPassword: pwForm.oldPassword, newPassword: pwForm.newPassword
      });
      setPwMessage('Password changed successfully');
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e) { setPwError(e.response?.data?.error || 'Password change failed'); }
  };

  if (!user) return <div className="ai-loading"><div className="spinner"></div><p>Loading profile...</p></div>;

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>My Profile</h2>
      {message && <div className="success-message" style={{marginBottom:'16px'}}>{message}</div>}
      {error && <div className="error-message" style={{marginBottom:'16px'}}>{error}</div>}

      <div className="detail-section">
        <div className="detail-header">
          <h3>Profile Information</h3>
          <button className="btn-primary" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>
        {editing ? (
          <form onSubmit={handleSave}>
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="555-0100" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Department</label>
                <input value={form.department} onChange={e => setForm({...form, department: e.target.value})} placeholder="e.g. Manufacturing" />
              </div>
            </div>
            <button type="submit" className="btn-primary">Save Changes</button>
          </form>
        ) : (
          <div className="detail-grid">
            <div className="detail-item"><label>Name</label><div className="value">{user.name}</div></div>
            <div className="detail-item"><label>Email</label><div className="value">{user.email}</div></div>
            <div className="detail-item"><label>Role</label><div className="value"><span className="status-badge status-active">{user.role}</span></div></div>
            <div className="detail-item"><label>Phone</label><div className="value">{user.phone || 'Not set'}</div></div>
            <div className="detail-item"><label>Department</label><div className="value">{user.department || 'Not set'}</div></div>
            <div className="detail-item"><label>Email Verified</label><div className="value">{user.email_verified ? 'Yes' : 'No'}</div></div>
            <div className="detail-item"><label>Member Since</label><div className="value">{new Date(user.created_at).toLocaleDateString()}</div></div>
          </div>
        )}
      </div>

      <div className="detail-section">
        <h3 style={{marginBottom:'20px'}}>Change Password</h3>
        {pwMessage && <div className="success-message" style={{marginBottom:'16px'}}>{pwMessage}</div>}
        {pwError && <div className="error-message" style={{marginBottom:'16px'}}>{pwError}</div>}
        <form onSubmit={handleChangePassword}>
          <div className="form-row">
            <div className="form-group">
              <label>Current Password</label>
              <input type="password" value={pwForm.oldPassword} onChange={e => setPwForm({...pwForm, oldPassword: e.target.value})} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={pwForm.newPassword} onChange={e => setPwForm({...pwForm, newPassword: e.target.value})} required minLength={6} />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input type="password" value={pwForm.confirmPassword} onChange={e => setPwForm({...pwForm, confirmPassword: e.target.value})} required />
            </div>
          </div>
          <button type="submit" className="btn-primary">Change Password</button>
        </form>
      </div>
    </div>
  );
};

export default Profile;
