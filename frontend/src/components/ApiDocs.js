import React from 'react';

const methodColors = {
  GET: '#60a5fa',
  POST: '#4ade80',
  PUT: '#fbbf24',
  DELETE: '#f87171'
};

const endpointGroups = [
  {
    name: 'Auth',
    endpoints: [
      { method: 'POST', path: '/api/auth/register', description: 'Register a new user account with name, email, password, and role.' },
      { method: 'POST', path: '/api/auth/login', description: 'Authenticate a user and receive a JWT token.' },
      { method: 'GET', path: '/api/auth/me', description: 'Get the currently authenticated user profile.' }
    ]
  },
  {
    name: 'Equipment',
    endpoints: [
      { method: 'GET', path: '/api/equipment', description: 'List all equipment with optional filtering and pagination.' },
      { method: 'GET', path: '/api/equipment/:id', description: 'Get detailed information for a specific piece of equipment.' },
      { method: 'POST', path: '/api/equipment', description: 'Create a new equipment record.' },
      { method: 'PUT', path: '/api/equipment/:id', description: 'Update an existing equipment record.' },
      { method: 'DELETE', path: '/api/equipment/:id', description: 'Delete an equipment record.' },
      { method: 'GET', path: '/api/equipment/:id/maintenance', description: 'List all maintenance records for a specific piece of equipment.' },
      { method: 'POST', path: '/api/equipment/:id/maintenance', description: 'Create a maintenance record for a specific piece of equipment.' }
    ]
  },
  {
    name: 'Routes',
    endpoints: [
      { method: 'GET', path: '/api/routes', description: 'List all production routes.' },
      { method: 'GET', path: '/api/routes/:id', description: 'Get details for a specific production route including steps.' },
      { method: 'POST', path: '/api/routes', description: 'Create a new production route.' },
      { method: 'PUT', path: '/api/routes/:id', description: 'Update an existing production route.' },
      { method: 'DELETE', path: '/api/routes/:id', description: 'Delete a production route.' }
    ]
  },
  {
    name: 'Safety',
    endpoints: [
      { method: 'GET', path: '/api/safety/incidents', description: 'List all safety incidents with optional filters.' },
      { method: 'GET', path: '/api/safety/incidents/:id', description: 'Get details for a specific safety incident.' },
      { method: 'POST', path: '/api/safety/incidents', description: 'Report a new safety incident.' },
      { method: 'PUT', path: '/api/safety/incidents/:id', description: 'Update a safety incident record.' },
      { method: 'DELETE', path: '/api/safety/incidents/:id', description: 'Delete a safety incident record.' }
    ]
  },
  {
    name: 'Assembly',
    endpoints: [
      { method: 'GET', path: '/api/assembly/lines', description: 'List all assembly lines with current status and metrics.' },
      { method: 'GET', path: '/api/assembly/lines/:id', description: 'Get detailed information for a specific assembly line.' },
      { method: 'POST', path: '/api/assembly/lines', description: 'Create a new assembly line.' },
      { method: 'PUT', path: '/api/assembly/lines/:id', description: 'Update an assembly line configuration.' },
      { method: 'DELETE', path: '/api/assembly/lines/:id', description: 'Delete an assembly line.' }
    ]
  },
  {
    name: 'Supply Chain',
    endpoints: [
      { method: 'GET', path: '/api/supply-chain/suppliers', description: 'List all suppliers with ratings and status.' },
      { method: 'GET', path: '/api/supply-chain/suppliers/:id', description: 'Get details for a specific supplier.' },
      { method: 'POST', path: '/api/supply-chain/suppliers', description: 'Add a new supplier.' },
      { method: 'PUT', path: '/api/supply-chain/suppliers/:id', description: 'Update supplier information.' },
      { method: 'DELETE', path: '/api/supply-chain/suppliers/:id', description: 'Remove a supplier.' },
      { method: 'GET', path: '/api/supply-chain/inventory', description: 'List current inventory levels.' },
      { method: 'POST', path: '/api/supply-chain/orders', description: 'Create a new procurement order.' }
    ]
  },
  {
    name: 'Notifications',
    endpoints: [
      { method: 'GET', path: '/api/notifications', description: 'List notifications for the authenticated user.' },
      { method: 'PUT', path: '/api/notifications/:id/read', description: 'Mark a notification as read.' },
      { method: 'PUT', path: '/api/notifications/read-all', description: 'Mark all notifications as read.' },
      { method: 'DELETE', path: '/api/notifications/:id', description: 'Delete a specific notification.' }
    ]
  },
  {
    name: 'Shifts',
    endpoints: [
      { method: 'GET', path: '/api/shifts', description: 'List all shifts with optional date filtering.' },
      { method: 'POST', path: '/api/shifts', description: 'Create a new shift schedule.' },
      { method: 'PUT', path: '/api/shifts/:id', description: 'Update a shift schedule.' },
      { method: 'DELETE', path: '/api/shifts/:id', description: 'Delete a shift schedule.' }
    ]
  },
  {
    name: 'Feedback',
    endpoints: [
      { method: 'GET', path: '/api/feedback', description: 'List all feedback submissions.' },
      { method: 'POST', path: '/api/feedback', description: 'Submit new feedback.' },
      { method: 'GET', path: '/api/feedback/:id', description: 'Get a specific feedback entry.' },
      { method: 'DELETE', path: '/api/feedback/:id', description: 'Delete a feedback entry.' }
    ]
  },
  {
    name: 'Admin',
    endpoints: [
      { method: 'GET', path: '/api/admin/users', description: 'List all users (admin only).' },
      { method: 'PUT', path: '/api/admin/users/:id/role', description: 'Update a user role (admin only).' },
      { method: 'DELETE', path: '/api/admin/users/:id', description: 'Delete a user account (admin only).' },
      { method: 'GET', path: '/api/admin/audit-log', description: 'View the system audit log (admin only).' },
      { method: 'GET', path: '/api/admin/stats', description: 'Get platform-wide statistics (admin only).' }
    ]
  }
];

const methodBadgeStyle = (method) => ({
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 700,
  color: '#0f172a',
  background: methodColors[method] || '#94a3b8',
  minWidth: 56,
  textAlign: 'center',
  fontFamily: 'monospace'
});

const pathStyle = {
  fontFamily: 'monospace',
  fontSize: 14,
  color: '#e2e8f0',
  fontWeight: 600
};

const descStyle = {
  fontSize: 13,
  color: '#94a3b8',
  marginTop: 4,
  lineHeight: 1.5
};

const endpointRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 16,
  padding: '12px 0',
  borderBottom: '1px solid #1e293b'
};

function ApiDocs() {
  return (
    <div>
      <div className="data-section">
        <h2 className="section-header">API Documentation</h2>
        <p style={{ color: '#94a3b8', lineHeight: 1.7, marginBottom: 8 }}>
          Complete reference for all available API endpoints. All endpoints require
          authentication via JWT Bearer token unless otherwise noted. Base URL:{' '}
          <code style={{ background: '#1e293b', padding: '2px 8px', borderRadius: 4, color: '#60a5fa' }}>
            http://localhost:3001/api
          </code>
        </p>
      </div>

      {endpointGroups.map((group) => (
        <div className="data-section" key={group.name}>
          <h2 className="section-header">{group.name}</h2>
          <div>
            {group.endpoints.map((endpoint, idx) => (
              <div key={idx} style={endpointRowStyle}>
                <span style={methodBadgeStyle(endpoint.method)}>{endpoint.method}</span>
                <div>
                  <div style={pathStyle}>{endpoint.path}</div>
                  <div style={descStyle}>{endpoint.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ApiDocs;
