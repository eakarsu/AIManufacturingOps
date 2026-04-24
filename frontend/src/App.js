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

const API_URL = 'http://localhost:3001/api';

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
  ];

  const managementItems = [
    { path: '/shifts', icon: '🕐', label: 'Shift Management' },
    { path: '/charts', icon: '📈', label: 'Charts & Analytics' },
    { path: '/search', icon: '🔍', label: 'Global Search' },
    { path: '/notifications', icon: '🔔', label: 'Notifications', badge: notificationCount },
  ];

  const securityItems = [
    { path: '/audit-log', icon: '📋', label: 'Audit Log' },
    { path: '/admin', icon: '👥', label: 'Admin Panel' },
    { path: '/file-upload', icon: '📎', label: 'File Upload' },
    { path: '/data-export', icon: '📤', label: 'Data Export' },
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
          {showOnboarding && user && (
            <Onboarding onComplete={() => {
              setShowOnboarding(false);
              localStorage.setItem('onboarding_completed', 'true');
            }} />
          )}
          <Routes>
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
            <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
          </Routes>
        </Router>
      </UserContext.Provider>
    </ThemeContext.Provider>
  );
}

export default App;
