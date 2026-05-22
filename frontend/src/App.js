import React, { useState, useEffect, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import Login from './components/Login';
import Register from './components/Register';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import Dashboard from './components/Dashboard';
import Equipment from './components/Equipment';
import RoutesPage from './components/Routes';
import Safety from './components/Safety';
import Assembly from './components/Assembly';
import SupplyChain from './components/SupplyChain';
import Profile from './components/Profile';
import Settings from './components/Settings';
import AdminPanel from './components/AdminPanel';
import Notifications from './components/Notifications';
import AuditLog from './components/AuditLog';
import ShiftManagement from './components/ShiftManagement';
import DataExport from './components/DataExport';
import Charts from './components/Charts';
import Search from './components/Search';
import FileUpload from './components/FileUpload';
import Feedback from './components/Feedback';
import Onboarding from './components/Onboarding';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import Contact from './components/Contact';
import ApiDocs from './components/ApiDocs';
import AICenter from './components/AICenter';
import CustomViewsPage from './pages/CustomViewsPage';
import ScrapReworkLoop from './components/ScrapReworkLoop';

import CodexCustomVizFeature from './pages/CodexCustomVizFeature';
import CodexOperationsFeature from './pages/CodexOperationsFeature';

// ERP pages
import GlChartOfAccountsPage from './pages/erp/GlChartOfAccountsPage';
import ApArPage from './pages/erp/ApArPage';
import InventoryGlPage from './pages/erp/InventoryGlPage';
import MrpPage from './pages/erp/MrpPage';
import BomsPage from './pages/erp/BomsPage';
import CostAccountingPage from './pages/erp/CostAccountingPage';
import ConsolidationsPage from './pages/erp/ConsolidationsPage';
import MultiCurrencyPage from './pages/erp/MultiCurrencyPage';
import IntercompanyPage from './pages/erp/IntercompanyPage';

const API_URL = 'http://localhost:4103/api';

export const ThemeContext = createContext();
export const UserContext = createContext();

// Configure axios
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Sidebar Component
const Sidebar = ({ user, onLogout, notificationCount }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const mainItems = [
    { path: '/dashboard', icon: '📊', label: 'Dashboard' },
    { path: '/equipment', icon: '⚙️', label: 'Predictive Maintenance' },
    { path: '/routes', icon: '🚚', label: 'Route Optimizer' },
    { path: '/safety', icon: '🛡️', label: 'Safety Predictor' },
    { path: '/assembly', icon: '🏭', label: 'Assembly Balancer' },
    { path: '/supply-chain', icon: '📦', label: 'Supply Chain' },
    { path: '/scrap-rework-loop', icon: '♻', label: 'Scrap/Rework Loop' },
  ];

  const managementItems = [
    { path: '/shifts', icon: '🕐', label: 'Shift Management' },
    { path: '/charts', icon: '📈', label: 'Charts & Analytics' },
    { path: '/search', icon: '🔍', label: 'Global Search' },
    { path: '/notifications', icon: '🔔', label: 'Notifications', badge: notificationCount },
    { path: '/custom-views', icon: '🏗️', label: 'Mfg Views' },
  ];

  const securityItems = [
    { path: '/audit-log', icon: '📋', label: 'Audit Log' },
    { path: '/admin', icon: '👥', label: 'Admin Panel' },
    { path: '/file-upload', icon: '📎', label: 'File Upload' },
    { path: '/data-export', icon: '📤', label: 'Data Export' },
  ];

  const erpItems = [
    { path: '/erp/gl-chart-of-accounts', icon: '📒', label: 'GL Chart of Accounts' },
    { path: '/erp/ap-ar', icon: '🧾', label: 'AP / AR' },
    { path: '/erp/inventory-gl', icon: '📦', label: 'Inventory GL' },
    { path: '/erp/mrp', icon: '🔄', label: 'MRP' },
    { path: '/erp/boms', icon: '🔩', label: 'Bills of Materials' },
    { path: '/erp/cost-accounting', icon: '💰', label: 'Cost Accounting' },
    { path: '/erp/consolidations', icon: '🏢', label: 'Consolidations' },
    { path: '/erp/multi-currency', icon: '💱', label: 'Multi-Currency' },
    { path: '/erp/intercompany', icon: '🔗', label: 'Intercompany' },
  ];

  const supportItems = [
    { path: '/feedback', icon: '💬', label: 'Feedback' },
    { path: '/api-docs', icon: '📚', label: 'API Docs' },
    { path: '/contact', icon: '📧', label: 'Contact' },
  ];

  const renderNavItems = (items) => items.map((item) => (
    <div
      key={item.path}
      className={`nav-item ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
      onClick={() => navigate(item.path)}
      role="button"
      tabIndex={0}
      aria-label={item.label}
      onKeyDown={(e) => e.key === 'Enter' && navigate(item.path)}
    >
      <span className="nav-icon">{item.icon}</span>
      <span>{item.label}</span>
      {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
    </div>
  ));

  return (
    <div className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="sidebar-header">
        <h1>AI Manufacturing</h1>
        <p>Operations Platform</p>
      </div>

      <nav className="nav-section">
        <div className="nav-section-title">Main</div>
        {renderNavItems(mainItems)}
      </nav>

      <nav className="nav-section">
        <div className="nav-section-title">Management</div>
        {renderNavItems(managementItems)}
      </nav>

      <nav className="nav-section">
        <div className="nav-section-title">Security</div>
        {renderNavItems(securityItems)}
      </nav>

      <nav className="nav-section">
        <div className="nav-section-title">ERP</div>
        {renderNavItems(erpItems)}
      </nav>

      <nav className="nav-section">
        <div className="nav-section-title">Support</div>
        {renderNavItems(supportItems)}
      </nav>

      <div className="user-section">
        <div className="user-info" onClick={() => navigate('/profile')} style={{cursor:'pointer'}} role="button" tabIndex={0}>
          <div className="user-avatar">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="user-details">
            <h4>{user?.name || 'User'}</h4>
            <p>{user?.email}</p>
          </div>
        </div>
        <div style={{display:'flex', gap:'8px'}}>
          <button className="btn-secondary" onClick={() => navigate('/settings')} style={{flex:1, padding:'10px'}}>
            <span>Settings</span>
          </button>
          <button className="logout-btn" onClick={onLogout} style={{flex:1}}>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children, user, onLogout, notificationCount }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-container">
      <Sidebar user={user} onLogout={onLogout} notificationCount={notificationCount} />
      <div className="main-content" role="main">
        {children}
      </div>
    </div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [notificationCount, setNotificationCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [wsAlerts, setWsAlerts] = useState([]);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await axios.get(`${API_URL}/auth/me`);
          setUser(response.data);
          // Check if first login for onboarding
          if (!localStorage.getItem('onboarding_completed')) {
            setShowOnboarding(true);
          }
          // Fetch notification count
          try {
            const notifRes = await axios.get(`${API_URL}/notifications?limit=1`);
            setNotificationCount(notifRes.data.unread || 0);
          } catch (e) { /* notifications table may not exist yet */ }
        } catch (error) {
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  // Fetch notification count periodically
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_URL}/notifications?limit=1`);
        setNotificationCount(res.data.unread || 0);
      } catch (e) { /* ignore */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // WebSocket real-time alerts
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    const ws = new WebSocket(`ws://localhost:4103/ws${token ? '?token=' + token : ''}`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'equipment:alert' || msg.type === 'ALERT') {
          const alert = msg.data || msg.payload;
          setWsAlerts(prev => [{ ...alert, id: Date.now(), dismissed: false }, ...prev.slice(0, 4)]);
          setNotificationCount(prev => prev + 1);
        }
      } catch (err) { /* ignore parse errors */ }
    };
    ws.onerror = () => {}; // silent fail if WS unavailable
    return () => ws.close();
  }, [user]);

  const handleLogin = (userData, token) => {
    localStorage.setItem('token', token);
    setUser(userData);
    if (!localStorage.getItem('onboarding_completed')) {
      setShowOnboarding(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setNotificationCount(0);
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
  };

  if (loading) {
    return (
      <div className="login-container">
        <div className="ai-loading">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const protectedRoute = (Component, props = {}) => (
    <ProtectedRoute user={user} onLogout={handleLogout} notificationCount={notificationCount}>
      <Component {...props} />
    </ProtectedRoute>
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleThemeChange }}>
      <UserContext.Provider value={{ user, setUser }}>
        <Router>
          {/* Real-time WebSocket alert toasts */}
          {wsAlerts.filter(a => !a.dismissed).length > 0 && (
            <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '360px' }}>
              {wsAlerts.filter(a => !a.dismissed).map(alert => (
                <div key={alert.id} style={{
                  background: alert.risk_level === 'Critical' ? '#7f1d1d' : '#7c2d12',
                  border: '1px solid #f87171', borderRadius: '8px', padding: '12px 16px',
                  color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#fca5a5' }}>{alert.risk_level} Equipment Alert</strong>
                    <button onClick={() => setWsAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, dismissed: true } : a))}
                      style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '16px' }}>×</button>
                  </div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>{alert.message || alert.equipment_name}</div>
                </div>
              ))}
            </div>
          )}
          {showOnboarding && user && (
            <Onboarding onComplete={() => {
              setShowOnboarding(false);
              localStorage.setItem('onboarding_completed', 'true');
            }} />
          )}
          <Routes>
        <Route path="/codex/custom-viz" element={<ProtectedRoute><CodexCustomVizFeature /></ProtectedRoute>} />
        <Route path="/codex/operations" element={<ProtectedRoute><CodexOperationsFeature /></ProtectedRoute>} />

            <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />} />
            <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register onLogin={handleLogin} />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route path="/dashboard" element={protectedRoute(Dashboard)} />
            <Route path="/equipment/*" element={protectedRoute(Equipment)} />
            <Route path="/routes/*" element={protectedRoute(RoutesPage)} />
            <Route path="/safety/*" element={protectedRoute(Safety)} />
            <Route path="/assembly/*" element={protectedRoute(Assembly)} />
            <Route path="/supply-chain/*" element={protectedRoute(SupplyChain)} />
            <Route path="/profile" element={protectedRoute(Profile)} />
            <Route path="/settings" element={protectedRoute(Settings, { onThemeChange: handleThemeChange })} />
            <Route path="/admin" element={protectedRoute(AdminPanel)} />
            <Route path="/notifications" element={protectedRoute(Notifications)} />
            <Route path="/audit-log" element={protectedRoute(AuditLog)} />
            <Route path="/shifts" element={protectedRoute(ShiftManagement)} />
            <Route path="/data-export" element={protectedRoute(DataExport)} />
            <Route path="/charts" element={protectedRoute(Charts)} />
            <Route path="/search" element={protectedRoute(Search)} />
            <Route path="/file-upload" element={protectedRoute(FileUpload)} />
            <Route path="/feedback" element={protectedRoute(Feedback)} />
            <Route path="/privacy-policy" element={protectedRoute(PrivacyPolicy)} />
            <Route path="/terms-of-service" element={protectedRoute(TermsOfService)} />
            <Route path="/contact" element={protectedRoute(Contact)} />
            <Route path="/api-docs" element={protectedRoute(ApiDocs)} />
            <Route path="/ai-center" element={protectedRoute(AICenter)} />
            <Route path="/custom-views" element={protectedRoute(CustomViewsPage)} />
            <Route path="/scrap-rework-loop" element={protectedRoute(ScrapReworkLoop)} />
            {/* ERP routes */}
            <Route path="/erp/gl-chart-of-accounts" element={protectedRoute(GlChartOfAccountsPage)} />
            <Route path="/erp/ap-ar" element={protectedRoute(ApArPage)} />
            <Route path="/erp/inventory-gl" element={protectedRoute(InventoryGlPage)} />
            <Route path="/erp/mrp" element={protectedRoute(MrpPage)} />
            <Route path="/erp/boms" element={protectedRoute(BomsPage)} />
            <Route path="/erp/cost-accounting" element={protectedRoute(CostAccountingPage)} />
            <Route path="/erp/consolidations" element={protectedRoute(ConsolidationsPage)} />
            <Route path="/erp/multi-currency" element={protectedRoute(MultiCurrencyPage)} />
            <Route path="/erp/intercompany" element={protectedRoute(IntercompanyPage)} />
            <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
          </Routes>
        </Router>
      </UserContext.Provider>
    </ThemeContext.Provider>
  );
}

export default App;
