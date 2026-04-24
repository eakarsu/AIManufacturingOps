import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seedingStatus, setSeedingStatus] = useState({});

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/dashboard/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSampleData = async (type, label) => {
    setSeedingStatus(prev => ({ ...prev, [type]: 'loading' }));
    try {
      await axios.post(`${API_URL}/seed/${type}`);
      setSeedingStatus(prev => ({ ...prev, [type]: 'done' }));
      fetchStats();
      setTimeout(() => setSeedingStatus(prev => ({ ...prev, [type]: null })), 2000);
    } catch (error) {
      console.error(`Error loading ${label} sample data:`, error);
      setSeedingStatus(prev => ({ ...prev, [type]: 'error' }));
      setTimeout(() => setSeedingStatus(prev => ({ ...prev, [type]: null })), 2000);
    }
  };

  const loadAllSampleData = async () => {
    const types = [
      { key: 'equipment', label: 'Equipment' },
      { key: 'routes', label: 'Routes' },
      { key: 'safety', label: 'Safety' },
      { key: 'assembly', label: 'Assembly' },
      { key: 'supply-chain', label: 'Supply Chain' },
      { key: 'notifications', label: 'Notifications' },
      { key: 'shifts', label: 'Shifts' },
      { key: 'feedback', label: 'Feedback' },
      { key: 'audit-logs', label: 'Audit Logs' },
    ];
    for (const t of types) {
      await loadSampleData(t.key, t.label);
    }
  };

  const coreFeatureCards = [
    {
      icon: '⚙️', title: 'AI Predictive Maintenance', path: '/equipment',
      description: 'Monitor equipment health and predict failures before they happen',
      statItems: [
        { value: stats?.equipment?.total || 0, label: 'Equipment' },
        { value: stats?.equipment?.critical || 0, label: 'Critical' },
        { value: `${Math.round(stats?.equipment?.avg_failure_prob || 0)}%`, label: 'Avg Risk' },
      ]
    },
    {
      icon: '🚚', title: 'AI Route Optimizer', path: '/routes',
      description: 'Optimize delivery routes for maximum efficiency and cost savings',
      statItems: [
        { value: stats?.routes?.total || 0, label: 'Routes' },
        { value: stats?.routes?.active || 0, label: 'Active' },
        { value: stats?.routes?.completed || 0, label: 'Completed' },
      ]
    },
    {
      icon: '🛡️', title: 'AI Safety Predictor', path: '/safety',
      description: 'Predict and prevent workplace safety incidents proactively',
      statItems: [
        { value: stats?.safety?.total || 0, label: 'Incidents' },
        { value: stats?.safety?.open || 0, label: 'Open' },
        { value: `${Math.round(stats?.safety?.avg_risk || 0)}%`, label: 'Avg Risk' },
      ]
    },
    {
      icon: '🏭', title: 'AI Assembly Balancer', path: '/assembly',
      description: 'Optimize production lines for maximum throughput and efficiency',
      statItems: [
        { value: stats?.assembly?.total || 0, label: 'Lines' },
        { value: `${Math.round(stats?.assembly?.avg_efficiency || 0)}%`, label: 'Efficiency' },
        { value: stats?.assembly?.total_output || 0, label: 'Output' },
      ]
    },
    {
      icon: '📦', title: 'AI Supply Chain', path: '/supply-chain',
      description: 'Track and analyze end-to-end supply chain in real-time',
      statItems: [
        { value: stats?.supplyChain?.total || 0, label: 'Shipments' },
        { value: stats?.supplyChain?.in_transit || 0, label: 'In Transit' },
        { value: stats?.supplyChain?.delivered || 0, label: 'Delivered' },
      ]
    },
  ];

  const managementCards = [
    { icon: '🕐', title: 'Shift Management', path: '/shifts', description: 'Manage worker shifts, schedules, and department assignments' },
    { icon: '📈', title: 'Charts & Analytics', path: '/charts', description: 'Visualize equipment, safety, and production data with interactive charts' },
    { icon: '🔍', title: 'Global Search', path: '/search', description: 'Search across all equipment, routes, incidents, and more' },
    { icon: '🔔', title: 'Notifications', path: '/notifications', description: `Equipment alerts and system notifications (${stats?.notifications?.unread || 0} unread)` },
    { icon: '📤', title: 'Data Export', path: '/data-export', description: 'Export data to CSV for reporting and analysis' },
    { icon: '📎', title: 'File Upload', path: '/file-upload', description: 'Upload incident photos and supporting documents' },
  ];

  const securityCards = [
    { icon: '📋', title: 'Audit Log', path: '/audit-log', description: 'View all system activity and user action history' },
    { icon: '👥', title: 'Admin Panel', path: '/admin', description: 'Manage users, roles, and system permissions' },
    { icon: '👤', title: 'My Profile', path: '/profile', description: 'View and edit your profile information' },
    { icon: '🔧', title: 'Settings', path: '/settings', description: 'Configure theme, notifications, and preferences' },
  ];

  const supportCards = [
    { icon: '💬', title: 'Feedback', path: '/feedback', description: 'Submit bug reports, feature requests, and general feedback' },
    { icon: '📚', title: 'API Documentation', path: '/api-docs', description: 'Browse all available API endpoints and documentation' },
    { icon: '📧', title: 'Contact Support', path: '/contact', description: 'Get help from our support team' },
    { icon: '📄', title: 'Privacy Policy', path: '/privacy-policy', description: 'Read our data protection and privacy practices' },
  ];

  const seedButtons = [
    { key: 'equipment', label: 'Equipment', icon: '⚙️' },
    { key: 'routes', label: 'Routes', icon: '🚚' },
    { key: 'safety', label: 'Safety', icon: '🛡️' },
    { key: 'assembly', label: 'Assembly', icon: '🏭' },
    { key: 'supply-chain', label: 'Supply Chain', icon: '📦' },
    { key: 'notifications', label: 'Notifications', icon: '🔔' },
    { key: 'shifts', label: 'Shifts', icon: '🕐' },
    { key: 'feedback', label: 'Feedback', icon: '💬' },
    { key: 'audit-logs', label: 'Audit Logs', icon: '📋' },
  ];

  if (loading) {
    return <div className="ai-loading"><div className="spinner"></div><p>Loading dashboard...</p></div>;
  }

  const renderFeatureCard = (card) => (
    <div key={card.path} className="feature-card" onClick={() => navigate(card.path)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && navigate(card.path)}>
      <div className="card-icon">{card.icon}</div>
      <h3>{card.title}</h3>
      <p>{card.description}</p>
      {card.statItems && (
        <div className="card-stats">
          {card.statItems.map((stat, i) => (
            <div key={i} className="stat">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="dashboard-header">
        <h2>Dashboard Overview</h2>
        <p>Welcome to your AI-powered manufacturing operations platform</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="icon">⚙️</div><h4>Total Equipment</h4><div className="value">{stats?.equipment?.total || 0}</div><div className="subtext">{stats?.equipment?.warning || 0} need attention</div></div>
        <div className="stat-card"><div className="icon">🚚</div><h4>Active Routes</h4><div className="value">{stats?.routes?.active || 0}</div><div className="subtext">{stats?.routes?.pending || 0} pending</div></div>
        <div className="stat-card"><div className="icon">🛡️</div><h4>Open Incidents</h4><div className="value">{stats?.safety?.open || 0}</div><div className="subtext">{stats?.safety?.critical || 0} critical</div></div>
        <div className="stat-card"><div className="icon">🏭</div><h4>Avg Efficiency</h4><div className="value">{Math.round(stats?.assembly?.avg_efficiency || 0)}%</div><div className="subtext">{stats?.assembly?.total || 0} lines running</div></div>
        <div className="stat-card"><div className="icon">📦</div><h4>Shipments</h4><div className="value">{stats?.supplyChain?.in_transit || 0}</div><div className="subtext">in transit</div></div>
      </div>

      <div className="data-section" style={{marginBottom: '24px'}}>
        <div className="section-header">
          <h3>Load Sample Data for Testing</h3>
          <button className="btn-ai" onClick={loadAllSampleData} disabled={Object.values(seedingStatus).some(s => s === 'loading')}>
            Load All Sample Data
          </button>
        </div>
        <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '16px 0'}}>
          {seedButtons.map(item => (
            <button
              key={item.key}
              className={seedingStatus[item.key] === 'done' ? 'btn-primary' : seedingStatus[item.key] === 'error' ? 'btn-danger' : 'btn-secondary'}
              onClick={() => loadSampleData(item.key, item.label)}
              disabled={seedingStatus[item.key] === 'loading'}
              style={{minWidth: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
            >
              <span>{item.icon}</span>
              {seedingStatus[item.key] === 'loading' ? 'Loading...' :
               seedingStatus[item.key] === 'done' ? 'Loaded!' :
               seedingStatus[item.key] === 'error' ? 'Error' : item.label}
            </button>
          ))}
        </div>
      </div>

      <h3 style={{marginBottom:'16px', color:'#9ca3af', fontSize:'13px', textTransform:'uppercase', letterSpacing:'1px'}}>Core AI Modules</h3>
      <div className="features-grid" style={{marginBottom:'32px'}}>
        {coreFeatureCards.map(renderFeatureCard)}
      </div>

      <h3 style={{marginBottom:'16px', color:'#9ca3af', fontSize:'13px', textTransform:'uppercase', letterSpacing:'1px'}}>Management & Analytics</h3>
      <div className="features-grid" style={{marginBottom:'32px'}}>
        {managementCards.map(renderFeatureCard)}
      </div>

      <h3 style={{marginBottom:'16px', color:'#9ca3af', fontSize:'13px', textTransform:'uppercase', letterSpacing:'1px'}}>Security & Administration</h3>
      <div className="features-grid" style={{marginBottom:'32px'}}>
        {securityCards.map(renderFeatureCard)}
      </div>

      <h3 style={{marginBottom:'16px', color:'#9ca3af', fontSize:'13px', textTransform:'uppercase', letterSpacing:'1px'}}>Support & Documentation</h3>
      <div className="features-grid" style={{marginBottom:'32px'}}>
        {supportCards.map(renderFeatureCard)}
      </div>
    </div>
  );
};

export default Dashboard;
