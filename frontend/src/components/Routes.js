import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const API_URL = 'http://localhost:3001/api';

// Routes List Component
const RoutesList = () => {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '', origin: '', destination: '', distance: '',
    estimated_time: '', vehicle_type: '', priority: 'normal',
    status: 'pending', waypoints: ''
  });

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      const response = await axios.get(`${API_URL}/routes`);
      setRoutes(response.data.data || response.data);
    } catch (error) {
      console.error('Error fetching routes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/routes`, formData);
      setShowModal(false);
      setFormData({
        name: '', origin: '', destination: '', distance: '',
        estimated_time: '', vehicle_type: '', priority: 'normal',
        status: 'pending', waypoints: ''
      });
      fetchRoutes();
    } catch (error) {
      console.error('Error creating route:', error);
    }
  };

  const getStatusClass = (status) => `status-badge status-${status}`;
  const getPriorityClass = (priority) => `priority-${priority}`;

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading routes...</p></div>;
  }

  return (
    <div>
      <div className="dashboard-header">
        <h2>AI Route Optimizer</h2>
        <p>Optimize delivery routes for maximum efficiency</p>
      </div>

      <div className="data-section">
        <div className="section-header">
          <h3>Delivery Routes ({routes.length})</h3>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Add Route
          </button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Route Name</th>
              <th>Origin</th>
              <th>Destination</th>
              <th>Distance</th>
              <th>Est. Time</th>
              <th>Vehicle</th>
              <th>Priority</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.id} onClick={() => navigate(`/routes/${route.id}`)}>
                <td><strong>{route.name}</strong></td>
                <td>{route.origin}</td>
                <td>{route.destination}</td>
                <td>{route.distance} km</td>
                <td>{route.estimated_time} min</td>
                <td>{route.vehicle_type}</td>
                <td className={getPriorityClass(route.priority)}>{route.priority}</td>
                <td><span className={getStatusClass(route.status)}>{route.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Route</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Route Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g., Chicago to Detroit"
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Origin</label>
                    <input
                      type="text"
                      value={formData.origin}
                      onChange={(e) => setFormData({...formData, origin: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Destination</label>
                    <input
                      type="text"
                      value={formData.destination}
                      onChange={(e) => setFormData({...formData, destination: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Distance (km)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.distance}
                      onChange={(e) => setFormData({...formData, distance: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Estimated Time (minutes)</label>
                    <input
                      type="number"
                      value={formData.estimated_time}
                      onChange={(e) => setFormData({...formData, estimated_time: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Vehicle Type</label>
                    <select
                      value={formData.vehicle_type}
                      onChange={(e) => setFormData({...formData, vehicle_type: e.target.value})}
                    >
                      <option value="">Select vehicle</option>
                      <option value="Semi-Truck">Semi-Truck</option>
                      <option value="Box Truck">Box Truck</option>
                      <option value="Van">Van</option>
                      <option value="Pickup">Pickup</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({...formData, priority: e.target.value})}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Waypoints (comma-separated)</label>
                    <input
                      type="text"
                      value={formData.waypoints}
                      onChange={(e) => setFormData({...formData, waypoints: e.target.value})}
                      placeholder="e.g., Gary, Kalamazoo"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Route</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Route Detail Component
const RouteDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchRoute();
  }, [id]);

  const fetchRoute = async () => {
    try {
      const response = await axios.get(`${API_URL}/routes/${id}`);
      setRoute(response.data);
      setFormData(response.data);
      if (response.data.ai_optimization) {
        setAiAnalysis({ optimization: response.data.ai_optimization });
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this route?')) {
      try {
        await axios.delete(`${API_URL}/routes/${id}`);
        navigate('/routes');
      } catch (error) {
        console.error('Error deleting route:', error);
      }
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_URL}/routes/${id}`, formData);
      setRoute(formData);
      setEditMode(false);
    } catch (error) {
      console.error('Error updating route:', error);
    }
  };

  const runAiOptimization = async () => {
    setAiLoading(true);
    try {
      const response = await axios.post(`${API_URL}/routes/${id}/optimize`);
      setAiAnalysis(response.data);
    } catch (error) {
      console.error('Error running AI optimization:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const getStatusClass = (status) => `status-badge status-${status}`;

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading...</p></div>;
  }

  if (!route) {
    return <div className="empty-state"><h3>Route not found</h3></div>;
  }

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/routes')}>
        ← Back to Routes
      </button>

      <div className="detail-section">
        <div className="detail-header">
          <div>
            <h2>{route.name}</h2>
            <span className={getStatusClass(route.status)}>{route.status}</span>
          </div>
          <div className="detail-actions">
            <button className="btn-ai" onClick={runAiOptimization} disabled={aiLoading}>
              {aiLoading ? 'Optimizing...' : '🤖 Optimize Route'}
            </button>
            <button className="btn-secondary" onClick={() => setEditMode(true)}>Edit</button>
            <button className="btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-item">
            <label>Origin</label>
            <div className="value">{route.origin}</div>
          </div>
          <div className="detail-item">
            <label>Destination</label>
            <div className="value">{route.destination}</div>
          </div>
          <div className="detail-item">
            <label>Distance</label>
            <div className="value">{route.distance} km</div>
          </div>
          <div className="detail-item">
            <label>Estimated Time</label>
            <div className="value">{route.estimated_time} minutes</div>
          </div>
          <div className="detail-item">
            <label>Vehicle Type</label>
            <div className="value">{route.vehicle_type}</div>
          </div>
          <div className="detail-item">
            <label>Priority</label>
            <div className="value" style={{textTransform: 'capitalize'}}>{route.priority}</div>
          </div>
          <div className="detail-item">
            <label>Waypoints</label>
            <div className="value">{route.waypoints || 'None'}</div>
          </div>
        </div>
      </div>

      {aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-loading">
            <div className="spinner"></div>
            <p>AI is optimizing your route...</p>
          </div>
        </div>
      )}

      {aiAnalysis && !aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-analysis-header">
            <span className="ai-icon">🤖</span>
            <h3>AI Route Optimization</h3>
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
              <h2>Edit Route</h2>
              <button className="modal-close" onClick={() => setEditMode(false)}>×</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Route Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Origin</label>
                    <input
                      type="text"
                      value={formData.origin}
                      onChange={(e) => setFormData({...formData, origin: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Destination</label>
                    <input
                      type="text"
                      value={formData.destination}
                      onChange={(e) => setFormData({...formData, destination: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Distance (km)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.distance}
                      onChange={(e) => setFormData({...formData, distance: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Estimated Time (minutes)</label>
                    <input
                      type="number"
                      value={formData.estimated_time}
                      onChange={(e) => setFormData({...formData, estimated_time: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({...formData, priority: e.target.value})}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
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

// Main Routes Router
const RoutesPage = () => {
  return (
    <Routes>
      <Route path="/" element={<RoutesList />} />
      <Route path="/:id" element={<RouteDetail />} />
    </Routes>
  );
};

export default RoutesPage;
