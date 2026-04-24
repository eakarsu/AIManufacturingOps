import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const API_URL = 'http://localhost:3001/api';

// Equipment List Component
const EquipmentList = () => {
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '', type: '', location: '', status: 'operational',
    last_maintenance: '', next_maintenance: '', temperature: '',
    vibration: '', runtime_hours: '', failure_probability: ''
  });

  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    try {
      const response = await axios.get(`${API_URL}/equipment`);
      setEquipment(response.data.data || response.data);
    } catch (error) {
      console.error('Error fetching equipment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/equipment`, formData);
      setShowModal(false);
      setFormData({
        name: '', type: '', location: '', status: 'operational',
        last_maintenance: '', next_maintenance: '', temperature: '',
        vibration: '', runtime_hours: '', failure_probability: ''
      });
      fetchEquipment();
    } catch (error) {
      console.error('Error creating equipment:', error);
    }
  };

  const getStatusClass = (status) => {
    return `status-badge status-${status}`;
  };

  const getRiskColor = (probability) => {
    if (probability >= 60) return 'severity-critical';
    if (probability >= 40) return 'severity-high';
    if (probability >= 20) return 'severity-medium';
    return 'severity-low';
  };

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading equipment...</p></div>;
  }

  return (
    <div>
      <div className="dashboard-header">
        <h2>AI Predictive Maintenance</h2>
        <p>Monitor equipment health and predict failures before they happen</p>
      </div>

      <div className="data-section">
        <div className="section-header">
          <h3>Equipment ({equipment.length})</h3>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Add Equipment
          </button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Location</th>
              <th>Status</th>
              <th>Temperature</th>
              <th>Vibration</th>
              <th>Failure Risk</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((item) => (
              <tr key={item.id} onClick={() => navigate(`/equipment/${item.id}`)}>
                <td><strong>{item.name}</strong></td>
                <td>{item.type}</td>
                <td>{item.location}</td>
                <td><span className={getStatusClass(item.status)}>{item.status}</span></td>
                <td>{item.temperature}°C</td>
                <td>{item.vibration} mm/s</td>
                <td className={getRiskColor(item.failure_probability)}>
                  {item.failure_probability}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Equipment</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <input
                      type="text"
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                      required
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
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="operational">Operational</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Temperature (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.temperature}
                      onChange={(e) => setFormData({...formData, temperature: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Vibration (mm/s)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.vibration}
                      onChange={(e) => setFormData({...formData, vibration: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Runtime Hours</label>
                    <input
                      type="number"
                      value={formData.runtime_hours}
                      onChange={(e) => setFormData({...formData, runtime_hours: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Failure Probability (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      max="100"
                      value={formData.failure_probability}
                      onChange={(e) => setFormData({...formData, failure_probability: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Last Maintenance</label>
                    <input
                      type="date"
                      value={formData.last_maintenance}
                      onChange={(e) => setFormData({...formData, last_maintenance: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Next Maintenance</label>
                    <input
                      type="date"
                      value={formData.next_maintenance}
                      onChange={(e) => setFormData({...formData, next_maintenance: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Equipment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Equipment Detail Component
const EquipmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchEquipment();
  }, [id]);

  const fetchEquipment = async () => {
    try {
      const response = await axios.get(`${API_URL}/equipment/${id}`);
      setEquipment(response.data);
      setFormData(response.data);
      if (response.data.ai_prediction) {
        setAiAnalysis({ analysis: response.data.ai_prediction });
      }
    } catch (error) {
      console.error('Error fetching equipment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this equipment?')) {
      try {
        await axios.delete(`${API_URL}/equipment/${id}`);
        navigate('/equipment');
      } catch (error) {
        console.error('Error deleting equipment:', error);
      }
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_URL}/equipment/${id}`, formData);
      setEquipment(formData);
      setEditMode(false);
    } catch (error) {
      console.error('Error updating equipment:', error);
    }
  };

  const runAiPrediction = async () => {
    setAiLoading(true);
    try {
      const response = await axios.post(`${API_URL}/equipment/${id}/predict`);
      setAiAnalysis(response.data);
    } catch (error) {
      console.error('Error running AI prediction:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const getStatusClass = (status) => `status-badge status-${status}`;

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading...</p></div>;
  }

  if (!equipment) {
    return <div className="empty-state"><h3>Equipment not found</h3></div>;
  }

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/equipment')}>
        ← Back to Equipment
      </button>

      <div className="detail-section">
        <div className="detail-header">
          <div>
            <h2>{equipment.name}</h2>
            <span className={getStatusClass(equipment.status)}>{equipment.status}</span>
          </div>
          <div className="detail-actions">
            <button className="btn-ai" onClick={runAiPrediction} disabled={aiLoading}>
              {aiLoading ? 'Analyzing...' : '🤖 Run AI Analysis'}
            </button>
            <button className="btn-secondary" onClick={() => setEditMode(true)}>Edit</button>
            <button className="btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-item">
            <label>Type</label>
            <div className="value">{equipment.type}</div>
          </div>
          <div className="detail-item">
            <label>Location</label>
            <div className="value">{equipment.location}</div>
          </div>
          <div className="detail-item">
            <label>Temperature</label>
            <div className="value">{equipment.temperature}°C</div>
          </div>
          <div className="detail-item">
            <label>Vibration</label>
            <div className="value">{equipment.vibration} mm/s</div>
          </div>
          <div className="detail-item">
            <label>Runtime Hours</label>
            <div className="value">{equipment.runtime_hours?.toLocaleString()}</div>
          </div>
          <div className="detail-item">
            <label>Failure Probability</label>
            <div className="value" style={{color: equipment.failure_probability > 50 ? '#f87171' : '#4ade80'}}>
              {equipment.failure_probability}%
            </div>
          </div>
          <div className="detail-item">
            <label>Last Maintenance</label>
            <div className="value">{equipment.last_maintenance || 'N/A'}</div>
          </div>
          <div className="detail-item">
            <label>Next Maintenance</label>
            <div className="value">{equipment.next_maintenance || 'N/A'}</div>
          </div>
        </div>
      </div>

      {aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-loading">
            <div className="spinner"></div>
            <p>AI is analyzing equipment data...</p>
          </div>
        </div>
      )}

      {aiAnalysis && !aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-analysis-header">
            <span className="ai-icon">🤖</span>
            <h3>AI Maintenance Prediction</h3>
            {aiAnalysis.model && <span className="model-badge">{aiAnalysis.model}</span>}
          </div>
          <div className="ai-analysis-content">
            <ReactMarkdown>{aiAnalysis.analysis}</ReactMarkdown>
          </div>
        </div>
      )}

      {editMode && (
        <div className="modal-overlay" onClick={() => setEditMode(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Equipment</h2>
              <button className="modal-close" onClick={() => setEditMode(false)}>×</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <input
                      type="text"
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                      required
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
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="operational">Operational</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Temperature (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.temperature}
                      onChange={(e) => setFormData({...formData, temperature: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Vibration (mm/s)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.vibration}
                      onChange={(e) => setFormData({...formData, vibration: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Runtime Hours</label>
                    <input
                      type="number"
                      value={formData.runtime_hours}
                      onChange={(e) => setFormData({...formData, runtime_hours: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Failure Probability (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      max="100"
                      value={formData.failure_probability}
                      onChange={(e) => setFormData({...formData, failure_probability: e.target.value})}
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

// Main Equipment Router
const Equipment = () => {
  return (
    <Routes>
      <Route path="/" element={<EquipmentList />} />
      <Route path="/:id" element={<EquipmentDetail />} />
    </Routes>
  );
};

export default Equipment;
