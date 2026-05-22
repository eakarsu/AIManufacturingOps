import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const API_URL = 'http://localhost:4103/api';

// Supply Chain List Component
const SupplyChainList = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    item_name: '', supplier: '', origin_location: '', current_location: '',
    destination: '', quantity: '', status: 'pending', estimated_arrival: '', tracking_number: ''
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await axios.get(`${API_URL}/supply-chain`);
      setItems(response.data.data || response.data);
    } catch (error) {
      console.error('Error fetching supply chain items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/supply-chain`, formData);
      setShowModal(false);
      setFormData({
        item_name: '', supplier: '', origin_location: '', current_location: '',
        destination: '', quantity: '', status: 'pending', estimated_arrival: '', tracking_number: ''
      });
      fetchItems();
    } catch (error) {
      console.error('Error creating supply chain item:', error);
    }
  };

  const getStatusClass = (status) => `status-badge status-${status.replace('_', '_')}`;

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading supply chain...</p></div>;
  }

  return (
    <div>
      <div className="dashboard-header">
        <h2>AI Supply Chain Visualizer</h2>
        <p>Track and analyze end-to-end supply chain</p>
      </div>

      <div className="data-section">
        <div className="section-header">
          <h3>Shipments ({items.length})</h3>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Add Shipment
          </button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Supplier</th>
              <th>Current Location</th>
              <th>Destination</th>
              <th>Quantity</th>
              <th>ETA</th>
              <th>Tracking</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} onClick={() => navigate(`/supply-chain/${item.id}`)}>
                <td><strong>{item.item_name}</strong></td>
                <td>{item.supplier}</td>
                <td>{item.current_location}</td>
                <td>{item.destination}</td>
                <td>{item.quantity?.toLocaleString()}</td>
                <td>{item.estimated_arrival ? new Date(item.estimated_arrival).toLocaleDateString() : 'N/A'}</td>
                <td style={{fontSize: '12px', fontFamily: 'monospace'}}>{item.tracking_number}</td>
                <td><span className={getStatusClass(item.status)}>{item.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Shipment</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Item Name</label>
                    <input
                      type="text"
                      value={formData.item_name}
                      onChange={(e) => setFormData({...formData, item_name: e.target.value})}
                      placeholder="e.g., Steel Coils"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Supplier</label>
                    <input
                      type="text"
                      value={formData.supplier}
                      onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Origin Location</label>
                    <input
                      type="text"
                      value={formData.origin_location}
                      onChange={(e) => setFormData({...formData, origin_location: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Current Location</label>
                    <input
                      type="text"
                      value={formData.current_location}
                      onChange={(e) => setFormData({...formData, current_location: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Destination</label>
                    <input
                      type="text"
                      value={formData.destination}
                      onChange={(e) => setFormData({...formData, destination: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Quantity</label>
                    <input
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData({...formData, quantity: e.target.value})}
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
                      <option value="processing">Processing</option>
                      <option value="in_transit">In Transit</option>
                      <option value="customs">Customs</option>
                      <option value="delivered">Delivered</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Estimated Arrival</label>
                    <input
                      type="date"
                      value={formData.estimated_arrival}
                      onChange={(e) => setFormData({...formData, estimated_arrival: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Tracking Number</label>
                    <input
                      type="text"
                      value={formData.tracking_number}
                      onChange={(e) => setFormData({...formData, tracking_number: e.target.value})}
                      placeholder="e.g., USC-2024-001234"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Shipment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Supply Chain Detail Component
const SupplyChainDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchItem();
  }, [id]);

  const fetchItem = async () => {
    try {
      const response = await axios.get(`${API_URL}/supply-chain/${id}`);
      setItem(response.data);
      setFormData(response.data);
      if (response.data.ai_analysis) {
        setAiAnalysis({ analysis: response.data.ai_analysis });
      }
    } catch (error) {
      console.error('Error fetching supply chain item:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this shipment?')) {
      try {
        await axios.delete(`${API_URL}/supply-chain/${id}`);
        navigate('/supply-chain');
      } catch (error) {
        console.error('Error deleting shipment:', error);
      }
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_URL}/supply-chain/${id}`, formData);
      setItem(formData);
      setEditMode(false);
    } catch (error) {
      console.error('Error updating shipment:', error);
    }
  };

  const runAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const response = await axios.post(`${API_URL}/supply-chain/${id}/analyze`);
      setAiAnalysis(response.data);
    } catch (error) {
      console.error('Error running AI analysis:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const getStatusClass = (status) => `status-badge status-${status}`;

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading...</p></div>;
  }

  if (!item) {
    return <div className="empty-state"><h3>Shipment not found</h3></div>;
  }

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/supply-chain')}>
        ← Back to Supply Chain
      </button>

      <div className="detail-section">
        <div className="detail-header">
          <div>
            <h2>{item.item_name}</h2>
            <span className={getStatusClass(item.status)}>{item.status.replace('_', ' ')}</span>
          </div>
          <div className="detail-actions">
            <button className="btn-ai" onClick={runAiAnalysis} disabled={aiLoading}>
              {aiLoading ? 'Analyzing...' : '🤖 AI Supply Analysis'}
            </button>
            <button className="btn-secondary" onClick={() => setEditMode(true)}>Edit</button>
            <button className="btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-item">
            <label>Supplier</label>
            <div className="value">{item.supplier}</div>
          </div>
          <div className="detail-item">
            <label>Quantity</label>
            <div className="value">{item.quantity?.toLocaleString()} units</div>
          </div>
          <div className="detail-item">
            <label>Origin</label>
            <div className="value">{item.origin_location}</div>
          </div>
          <div className="detail-item">
            <label>Current Location</label>
            <div className="value">{item.current_location}</div>
          </div>
          <div className="detail-item">
            <label>Destination</label>
            <div className="value">{item.destination}</div>
          </div>
          <div className="detail-item">
            <label>Estimated Arrival</label>
            <div className="value">{item.estimated_arrival ? new Date(item.estimated_arrival).toLocaleDateString() : 'N/A'}</div>
          </div>
          <div className="detail-item">
            <label>Tracking Number</label>
            <div className="value" style={{fontFamily: 'monospace'}}>{item.tracking_number}</div>
          </div>
          <div className="detail-item">
            <label>Created</label>
            <div className="value">{new Date(item.created_at).toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-loading">
            <div className="spinner"></div>
            <p>AI is analyzing supply chain data...</p>
          </div>
        </div>
      )}

      {aiAnalysis && !aiLoading && (
        <div className="ai-analysis-section">
          <div className="ai-analysis-header">
            <span className="ai-icon">🤖</span>
            <h3>AI Supply Chain Analysis</h3>
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
              <h2>Edit Shipment</h2>
              <button className="modal-close" onClick={() => setEditMode(false)}>×</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Item Name</label>
                    <input
                      type="text"
                      value={formData.item_name}
                      onChange={(e) => setFormData({...formData, item_name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Supplier</label>
                    <input
                      type="text"
                      value={formData.supplier}
                      onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Current Location</label>
                    <input
                      type="text"
                      value={formData.current_location}
                      onChange={(e) => setFormData({...formData, current_location: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Destination</label>
                    <input
                      type="text"
                      value={formData.destination}
                      onChange={(e) => setFormData({...formData, destination: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Quantity</label>
                    <input
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                    >
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="in_transit">In Transit</option>
                      <option value="customs">Customs</option>
                      <option value="delivered">Delivered</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Estimated Arrival</label>
                    <input
                      type="date"
                      value={formData.estimated_arrival ? formData.estimated_arrival.split('T')[0] : ''}
                      onChange={(e) => setFormData({...formData, estimated_arrival: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Tracking Number</label>
                    <input
                      type="text"
                      value={formData.tracking_number}
                      onChange={(e) => setFormData({...formData, tracking_number: e.target.value})}
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

// Main Supply Chain Router
const SupplyChain = () => {
  return (
    <Routes>
      <Route path="/" element={<SupplyChainList />} />
      <Route path="/:id" element={<SupplyChainDetail />} />
    </Routes>
  );
};

export default SupplyChain;
