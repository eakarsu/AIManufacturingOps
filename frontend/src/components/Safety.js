import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const API_URL = 'http://localhost:3001/api';

// Safety List Component
const SafetyList = () => {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', location: '', severity: 'low',
    incident_type: '', reported_by: '', status: 'open', risk_score: ''
  });

  useEffect(() => {
    fetchIncidents();
  }, []);

  const fetchIncidents = async () => {
    try {
      const response = await axios.get(`${API_URL}/safety`);
      setIncidents(response.data.data || response.data);
    } catch (error) {
      console.error('Error fetching incidents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/safety`, formData);
      setShowModal(false);
      setFormData({
        title: '', description: '', location: '', severity: 'low',
        incident_type: '', reported_by: '', status: 'open', risk_score: ''
      });
      fetchIncidents();
    } catch (error) {
      console.error('Error creating incident:', error);
    }
  };

  const getStatusClass = (status) => `status-badge status-${status}`;
  const getSeverityClass = (severity) => `severity-${severity}`;

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading incidents...</p></div>;
  }

  return (
    <div>
      <div className="dashboard-header">
        <h2>AI Safety Incident Predictor</h2>
        <p>Predict and prevent workplace safety incidents</p>
      </div>

      <div className="data-section">
        <div className="section-header">
          <h3>Safety Incidents ({incidents.length})</h3>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Report Incident
          </button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Location</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Risk Score</th>
              <th>Reported By</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr key={incident.id} onClick={() => navigate(`/safety/${incident.id}`)}>
                <td><strong>{incident.title}</strong></td>
                <td>{incident.location}</td>
                <td>{incident.incident_type}</td>
                <td className={getSeverityClass(incident.severity)}>{incident.severity}</td>
                <td className={getSeverityClass(incident.risk_score > 60 ? 'critical' : incident.risk_score > 40 ? 'high' : 'medium')}>
                  {incident.risk_score}%
                </td>
                <td>{incident.reported_by}</td>
                <td><span className={getStatusClass(incident.status)}>{incident.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Report Safety Incident</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      placeholder="Brief description of the incident"
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea
                      style={{width: '100%', minHeight: '80px', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', resize: 'vertical'}}
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Detailed description of the incident"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Incident Type</label>
                    <select
                      value={formData.incident_type}
                      onChange={(e) => setFormData({...formData, incident_type: e.target.value})}
                    >
                      <option value="">Select type</option>
                      <option value="slip_fall">Slip/Fall</option>
                      <option value="equipment">Equipment</option>
                      <option value="chemical">Chemical</option>
                      <option value="electrical">Electrical</option>
                      <option value="fire_safety">Fire Safety</option>
                      <option value="vehicle">Vehicle</option>
                      <option value="ergonomic">Ergonomic</option>
                      <option value="ppe">PPE Non-Compliance</option>
                      <option value="environmental">Environmental</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Severity</label>
                    <select
                      value={formData.severity}
                      onChange={(e) => setFormData({...formData, severity: e.target.value})}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Risk Score (%)</label>
                    <input
                      type="number"
                      max="100"
                      value={formData.risk_score}
                      onChange={(e) => setFormData({...formData, risk_score: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Reported By</label>
                    <input
                      type="text"
                      value={formData.reported_by}
                      onChange={(e) => setFormData({...formData, reported_by: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="open">Open</option>
                      <option value="investigating">Investigating</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Report Incident</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Safety Detail Component
const SafetyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchIncident();
  }, [id]);

  const fetchIncident = async () => {
    try {
      const response = await axios.get(`${API_URL}/safety/${id}`);
      setIncident(response.data);
      setFormData(response.data);
      if (response.data.ai_prediction) {
        setAiAnalysis({ prediction: response.data.ai_prediction });
      }
    } catch (error) {
      console.error('Error fetching incident:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this incident?')) {
      try {
        await axios.delete(`${API_URL}/safety/${id}`);
        navigate('/safety');
      } catch (error) {
        console.error('Error deleting incident:', error);
      }
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_URL}/safety/${id}`, formData);
      setIncident(formData);
      setEditMode(false);
    } catch (error) {
      console.error('Error updating incident:', error);
    }
  };

  const runAiPrediction = async () => {
    setAiLoading(true);
    try {
      const response = await axios.post(`${API_URL}/safety/${id}/predict`);
      setAiAnalysis(response.data);
    } catch (error) {
      console.error('Error running AI prediction:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const getStatusClass = (status) => `status-badge status-${status}`;
  const getSeverityClass = (severity) => `severity-${severity}`;

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading...</p></div>;
  }

  if (!incident) {
    return <div className="empty-state"><h3>Incident not found</h3></div>;
  }

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/safety')}>
        ← Back to Safety Incidents
      </button>

      <div className="detail-section">
        <div className="detail-header">
          <div>
            <h2>{incident.title}</h2>
            <span className={getStatusClass(incident.status)}>{incident.status}</span>
            <span className={`status-badge ${getSeverityClass(incident.severity)}`} style={{marginLeft: '8px'}}>
              {incident.severity}
            </span>
          </div>
          <div className="detail-actions">
            <button className="btn-ai" onClick={runAiPrediction} disabled={aiLoading}>
              {aiLoading ? 'Analyzing...' : '🤖 AI Safety Analysis'}
            </button>
            <button className="btn-secondary" onClick={() => setEditMode(true)}>Edit</button>
            <button className="btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-item" style={{gridColumn: 'span 2'}}>
            <label>Description</label>
            <div className="value">{incident.description || 'No description provided'}</div>
          </div>
          <div className="detail-item">
            <label>Location</label>
            <div className="value">{incident.location}</div>
          </div>
          <div className="detail-item">
            <label>Incident Type</label>
            <div className="value">{incident.incident_type}</div>
          </div>
          <div className="detail-item">
            <label>Risk Score</label>
            <div className="value" style={{color: incident.risk_score > 60 ? '#f87171' : incident.risk_score > 40 ? '#fbbf24' : '#4ade80'}}>
              {incident.risk_score}%
            </div>
          </div>
          <div className="detail-item">
            <label>Reported By</label>
            <div className="value">{incident.reported_by}</div>
          </div>
          <div className="detail-item">
            <label>Created</label>
            <div className="value">{new Date(incident.created_at).toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-loading">
            <div className="spinner"></div>
            <p>AI is analyzing safety risks...</p>
          </div>
        </div>
      )}

      {aiAnalysis && !aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-analysis-header">
            <span className="ai-icon">🤖</span>
            <h3>AI Safety Risk Analysis</h3>
            {aiAnalysis.model && <span className="model-badge">{aiAnalysis.model}</span>}
          </div>
          <div className="ai-analysis-content">
            <ReactMarkdown>{aiAnalysis.prediction}</ReactMarkdown>
          </div>
        </div>
      )}

      {editMode && (
        <div className="modal-overlay" onClick={() => setEditMode(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Safety Incident</h2>
              <button className="modal-close" onClick={() => setEditMode(false)}>×</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea
                      style={{width: '100%', minHeight: '80px', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', resize: 'vertical'}}
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Severity</label>
                    <select
                      value={formData.severity}
                      onChange={(e) => setFormData({...formData, severity: e.target.value})}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="open">Open</option>
                      <option value="investigating">Investigating</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Risk Score (%)</label>
                    <input
                      type="number"
                      max="100"
                      value={formData.risk_score}
                      onChange={(e) => setFormData({...formData, risk_score: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditMode(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Main Safety Router
const Safety = () => {
  return (
    <Routes>
      <Route path="/" element={<SafetyList />} />
      <Route path="/:id" element={<SafetyDetail />} />
    </Routes>
  );
};

export default Safety;
