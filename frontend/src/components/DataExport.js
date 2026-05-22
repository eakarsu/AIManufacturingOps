import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:4103/api';

const DataExport = () => {
  const [selectedType, setSelectedType] = useState('equipment');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');

  const exportTypes = [
    { value: 'equipment', label: 'Equipment', icon: '⚙️' },
    { value: 'safety', label: 'Safety Incidents', icon: '🛡️' },
    { value: 'routes', label: 'Routes', icon: '🚚' },
    { value: 'assembly', label: 'Assembly Lines', icon: '🏭' },
    { value: 'supply-chain', label: 'Supply Chain', icon: '📦' },
    { value: 'audit-logs', label: 'Audit Logs', icon: '📋' },
    { value: 'shifts', label: 'Shifts', icon: '🕐' },
  ];

  const handleExport = async () => {
    setExporting(true);
    setMessage('');
    try {
      const response = await axios.get(`${API_URL}/export/${selectedType}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedType}_export_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage('Export downloaded successfully!');
    } catch (e) {
      setMessage('Export failed. There may be no data to export.');
    }
    setExporting(false);
  };

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>Data Export</h2>
      <div className="data-section">
        <div className="section-header"><h3>Export Data as CSV</h3></div>
        <p style={{color:'#9ca3af', marginBottom:'24px'}}>Select a data type and click export to download a CSV file.</p>

        <div className="export-grid">
          {exportTypes.map(type => (
            <div
              key={type.value}
              className={`export-card ${selectedType === type.value ? 'selected' : ''}`}
              onClick={() => setSelectedType(type.value)}
            >
              <span style={{fontSize:'32px'}}>{type.icon}</span>
              <span style={{fontWeight:500}}>{type.label}</span>
            </div>
          ))}
        </div>

        <div style={{marginTop:'24px', display:'flex', alignItems:'center', gap:'16px'}}>
          <button className="btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : `Export ${exportTypes.find(t=>t.value===selectedType)?.label || ''}`}
          </button>
          {message && <span style={{color: message.includes('success') ? '#4ade80' : '#f87171'}}>{message}</span>}
        </div>
      </div>
    </div>
  );
};

export default DataExport;
