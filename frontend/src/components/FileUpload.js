import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:4103/api';

function FileUpload() {
  const [file, setFile] = useState(null);
  const [entityType, setEntityType] = useState('equipment');
  const [entityId, setEntityId] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [lookupEntityType, setLookupEntityType] = useState('equipment');
  const [lookupEntityId, setLookupEntityId] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !entityId) {
      setMessage('Please select a file and enter an entity ID.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entity_type', entityType);
    formData.append('entity_id', entityId);

    setUploading(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/uploads`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      setMessage('File uploaded successfully.');
      setFile(null);
      setEntityId('');
      const fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.value = '';
    } catch (err) {
      setMessage('Upload failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  const fetchFiles = async () => {
    if (!lookupEntityId) {
      setMessage('Please enter an entity ID to look up files.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(
        `${API_URL}/uploads/${lookupEntityType}/${lookupEntityId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUploadedFiles(res.data);
      setMessage('');
    } catch (err) {
      setMessage('Failed to fetch files: ' + (err.response?.data?.error || err.message));
      setUploadedFiles([]);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/uploads/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUploadedFiles(uploadedFiles.filter((f) => f.id !== id));
      setMessage('File deleted successfully.');
    } catch (err) {
      setMessage('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div>
      <div className="data-section">
        <h2 className="section-header">Upload File</h2>
        {message && (
          <p style={{ color: message.includes('success') ? '#4ade80' : '#f87171', marginBottom: 12 }}>
            {message}
          </p>
        )}
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label>File</label>
            <input
              id="file-input"
              type="file"
              onChange={handleFileChange}
            />
          </div>
          <div className="form-group">
            <label>Entity Type</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="equipment">Equipment</option>
              <option value="maintenance">Maintenance</option>
              <option value="route">Route</option>
              <option value="safety">Safety Incident</option>
              <option value="assembly">Assembly Line</option>
              <option value="supply_chain">Supply Chain</option>
            </select>
          </div>
          <div className="form-group">
            <label>Entity ID</label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="Enter entity ID"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      </div>

      <div className="data-section">
        <h2 className="section-header">Browse Uploaded Files</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Entity Type</label>
            <select
              value={lookupEntityType}
              onChange={(e) => setLookupEntityType(e.target.value)}
            >
              <option value="equipment">Equipment</option>
              <option value="maintenance">Maintenance</option>
              <option value="route">Route</option>
              <option value="safety">Safety Incident</option>
              <option value="assembly">Assembly Line</option>
              <option value="supply_chain">Supply Chain</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Entity ID</label>
            <input
              type="text"
              value={lookupEntityId}
              onChange={(e) => setLookupEntityId(e.target.value)}
              placeholder="Enter entity ID"
            />
          </div>
          <button className="btn-primary" onClick={fetchFiles}>
            Search
          </button>
        </div>

        {uploadedFiles.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploadedFiles.map((f) => (
                <tr key={f.id}>
                  <td>{f.original_name || f.filename || 'Unnamed'}</td>
                  <td>{formatFileSize(f.file_size || f.size)}</td>
                  <td>{formatDate(f.created_at || f.uploaded_at)}</td>
                  <td>
                    <button
                      className="btn-danger"
                      onClick={() => handleDelete(f.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {uploadedFiles.length === 0 && (
          <p style={{ color: '#94a3b8' }}>No files found. Use the search above to look up files by entity.</p>
        )}
      </div>
    </div>
  );
}

export default FileUpload;
