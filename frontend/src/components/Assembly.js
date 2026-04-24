import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const API_URL = 'http://localhost:3001/api';

// Assembly List Component
const AssemblyList = () => {
  const navigate = useNavigate();
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '', product: '', capacity: '', current_output: '',
    efficiency: '', workers: '', stations: '', bottleneck: '', status: 'running'
  });

  useEffect(() => {
    fetchLines();
  }, []);

  const fetchLines = async () => {
    try {
      const response = await axios.get(`${API_URL}/assembly`);
      setLines(response.data.data || response.data);
    } catch (error) {
      console.error('Error fetching assembly lines:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/assembly`, formData);
      setShowModal(false);
      setFormData({
        name: '', product: '', capacity: '', current_output: '',
        efficiency: '', workers: '', stations: '', bottleneck: '', status: 'running'
      });
      fetchLines();
    } catch (error) {
      console.error('Error creating assembly line:', error);
    }
  };

  const getStatusClass = (status) => `status-badge status-${status}`;

  const getEfficiencyColor = (efficiency) => {
    if (efficiency >= 90) return '#4ade80';
    if (efficiency >= 70) return '#fbbf24';
    return '#f87171';
  };

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading assembly lines...</p></div>;
  }

  return (
    <div>
      <div className="dashboard-header">
        <h2>AI Assembly Line Balancer</h2>
        <p>Optimize production lines for maximum throughput</p>
      </div>

      <div className="data-section">
        <div className="section-header">
          <h3>Assembly Lines ({lines.length})</h3>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Add Assembly Line
          </button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Line Name</th>
              <th>Product</th>
              <th>Output</th>
              <th>Efficiency</th>
              <th>Workers</th>
              <th>Stations</th>
              <th>Bottleneck</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} onClick={() => navigate(`/assembly/${line.id}`)}>
                <td><strong>{line.name}</strong></td>
                <td>{line.product}</td>
                <td>{line.current_output} / {line.capacity}</td>
                <td>
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <div className="progress-bar" style={{width: '60px'}}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${line.efficiency}%`,
                          background: getEfficiencyColor(line.efficiency)
                        }}
                      ></div>
                    </div>
                    <span style={{color: getEfficiencyColor(line.efficiency)}}>{line.efficiency}%</span>
                  </div>
                </td>
                <td>{line.workers}</td>
                <td>{line.stations}</td>
                <td style={{color: line.bottleneck !== 'None' ? '#fbbf24' : '#4ade80'}}>
                  {line.bottleneck || 'None'}
                </td>
                <td><span className={getStatusClass(line.status)}>{line.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Assembly Line</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Line Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g., Line Alpha"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Product</label>
                    <input
                      type="text"
                      value={formData.product}
                      onChange={(e) => setFormData({...formData, product: e.target.value})}
                      placeholder="e.g., Engine Components"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Capacity (units/day)</label>
                    <input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData({...formData, capacity: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Current Output (units/day)</label>
                    <input
                      type="number"
                      value={formData.current_output}
                      onChange={(e) => setFormData({...formData, current_output: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Workers</label>
                    <input
                      type="number"
                      value={formData.workers}
                      onChange={(e) => setFormData({...formData, workers: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Stations</label>
                    <input
                      type="number"
                      value={formData.stations}
                      onChange={(e) => setFormData({...formData, stations: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Efficiency (%)</label>
                    <input
                      type="number"
                      max="100"
                      value={formData.efficiency}
                      onChange={(e) => setFormData({...formData, efficiency: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="running">Running</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                      <option value="stopped">Stopped</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Bottleneck (if any)</label>
                    <input
                      type="text"
                      value={formData.bottleneck}
                      onChange={(e) => setFormData({...formData, bottleneck: e.target.value})}
                      placeholder="e.g., Station 3 - Welding"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Assembly Line</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Assembly Detail Component
const AssemblyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [line, setLine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchLine();
  }, [id]);

  const fetchLine = async () => {
    try {
      const response = await axios.get(`${API_URL}/assembly/${id}`);
      setLine(response.data);
      setFormData(response.data);
      if (response.data.ai_optimization) {
        setAiAnalysis({ optimization: response.data.ai_optimization });
      }
    } catch (error) {
      console.error('Error fetching assembly line:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this assembly line?')) {
      try {
        await axios.delete(`${API_URL}/assembly/${id}`);
        navigate('/assembly');
      } catch (error) {
        console.error('Error deleting assembly line:', error);
      }
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_URL}/assembly/${id}`, formData);
      setLine(formData);
      setEditMode(false);
    } catch (error) {
      console.error('Error updating assembly line:', error);
    }
  };

  const runAiOptimization = async () => {
    setAiLoading(true);
    try {
      const response = await axios.post(`${API_URL}/assembly/${id}/optimize`);
      setAiAnalysis(response.data);
    } catch (error) {
      console.error('Error running AI optimization:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const getStatusClass = (status) => `status-badge status-${status}`;

  const getEfficiencyColor = (efficiency) => {
    if (efficiency >= 90) return '#4ade80';
    if (efficiency >= 70) return '#fbbf24';
    return '#f87171';
  };

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading...</p></div>;
  }

  if (!line) {
    return <div className="empty-state"><h3>Assembly line not found</h3></div>;
  }

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/assembly')}>
        ← Back to Assembly Lines
      </button>

      <div className="detail-section">
        <div className="detail-header">
          <div>
            <h2>{line.name}</h2>
            <span className={getStatusClass(line.status)}>{line.status}</span>
          </div>
          <div className="detail-actions">
            <button className="btn-ai" onClick={runAiOptimization} disabled={aiLoading}>
              {aiLoading ? 'Optimizing...' : '🤖 Optimize Line'}
            </button>
            <button className="btn-secondary" onClick={() => setEditMode(true)}>Edit</button>
            <button className="btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-item">
            <label>Product</label>
            <div className="value">{line.product}</div>
          </div>
          <div className="detail-item">
            <label>Capacity</label>
            <div className="value">{line.capacity} units/day</div>
          </div>
          <div className="detail-item">
            <label>Current Output</label>
            <div className="value">{line.current_output} units/day</div>
          </div>
          <div className="detail-item">
            <label>Efficiency</label>
            <div className="value" style={{color: getEfficiencyColor(line.efficiency)}}>
              {line.efficiency}%
            </div>
          </div>
          <div className="detail-item">
            <label>Workers</label>
            <div className="value">{line.workers}</div>
          </div>
          <div className="detail-item">
            <label>Stations</label>
            <div className="value">{line.stations}</div>
          </div>
          <div className="detail-item">
            <label>Bottleneck</label>
            <div className="value" style={{color: line.bottleneck !== 'None' ? '#fbbf24' : '#4ade80'}}>
              {line.bottleneck || 'None'}
            </div>
          </div>
          <div className="detail-item">
            <label>Output Gap</label>
            <div className="value" style={{color: '#f87171'}}>
              {line.capacity - line.current_output} units/day
            </div>
          </div>
        </div>
      </div>

      {aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-loading">
            <div className="spinner"></div>
            <p>AI is analyzing assembly line efficiency...</p>
          </div>
        </div>
      )}

      {aiAnalysis && !aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-analysis-header">
            <span className="ai-icon">🤖</span>
            <h3>AI Line Optimization</h3>
            {aiAnalysis.model && <span className="model-badge">{aiAnalysis.model}</span>}
          </div>
          <div className="ai-analysis-content">
            <ReactMarkdown>{aiAnalysis.optimization}</ReactMarkdown>
          </div>
        </div>
      )}

      {editMode && (
        <div className="modal-overlay" onClick={() => setEditMode(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Assembly Line</h2>
              <button className="modal-close" onClick={() => setEditMode(false)}>×</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Line Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Product</label>
                    <input
                      type="text"
                      value={formData.product}
                      onChange={(e) => setFormData({...formData, product: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Capacity</label>
                    <input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData({...formData, capacity: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Current Output</label>
                    <input
                      type="number"
                      value={formData.current_output}
                      onChange={(e) => setFormData({...formData, current_output: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Workers</label>
                    <input
                      type="number"
                      value={formData.workers}
                      onChange={(e) => setFormData({...formData, workers: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Stations</label>
                    <input
                      type="number"
                      value={formData.stations}
                      onChange={(e) => setFormData({...formData, stations: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Efficiency (%)</label>
                    <input
                      type="number"
                      max="100"
                      value={formData.efficiency}
                      onChange={(e) => setFormData({...formData, efficiency: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="running">Running</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                      <option value="stopped">Stopped</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Bottleneck</label>
                    <input
                      type="text"
                      value={formData.bottleneck || ''}
                      onChange={(e) => setFormData({...formData, bottleneck: e.target.value})}
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

// Main Assembly Router
const Assembly = () => {
  return (
    <Routes>
      <Route path="/" element={<AssemblyList />} />
      <Route path="/:id" element={<AssemblyDetail />} />
    </Routes>
  );
};

export default Assembly;
