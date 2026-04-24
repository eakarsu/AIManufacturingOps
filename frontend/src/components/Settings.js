import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const Settings = ({ onThemeChange }) => {
  const [settings, setSettings] = useState({ theme: 'dark', email_notifications: true, push_notifications: false, language: 'en' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API_URL}/settings`);
      setSettings(res.data);
    } catch (e) { console.error('Failed to load settings'); }
    setLoading(false);
  };

  const saveSettings = async (newSettings) => {
    try {
      const res = await axios.put(`${API_URL}/settings`, newSettings);
      setSettings(res.data);
      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) { console.error('Failed to save settings'); }
  };

  const handleThemeToggle = () => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    const updated = { ...settings, theme: newTheme };
    setSettings(updated);
    saveSettings(updated);
    if (onThemeChange) onThemeChange(newTheme);
  };

  const handleToggle = (field) => {
    const updated = { ...settings, [field]: !settings[field] };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleLanguage = (e) => {
    const updated = { ...settings, language: e.target.value };
    setSettings(updated);
    saveSettings(updated);
  };

  if (loading) return <div className="ai-loading"><div className="spinner"></div><p>Loading settings...</p></div>;

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>Settings</h2>
      {message && <div className="success-message" style={{marginBottom:'16px'}}>{message}</div>}

      <div className="detail-section">
        <h3 style={{marginBottom:'20px'}}>Appearance</h3>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Theme</strong>
            <p style={{color:'#6b7280', fontSize:'13px'}}>Choose between dark and light mode</p>
          </div>
          <button className="toggle-btn" onClick={handleThemeToggle} aria-label="Toggle theme">
            <div className={`toggle-track ${settings.theme === 'light' ? 'active' : ''}`}>
              <div className="toggle-thumb"></div>
            </div>
            <span>{settings.theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
      </div>

      <div className="detail-section">
        <h3 style={{marginBottom:'20px'}}>Notifications</h3>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Email Notifications</strong>
            <p style={{color:'#6b7280', fontSize:'13px'}}>Receive alerts via email</p>
          </div>
          <button className="toggle-btn" onClick={() => handleToggle('email_notifications')}>
            <div className={`toggle-track ${settings.email_notifications ? 'active' : ''}`}>
              <div className="toggle-thumb"></div>
            </div>
            <span>{settings.email_notifications ? 'On' : 'Off'}</span>
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            <strong>Push Notifications</strong>
            <p style={{color:'#6b7280', fontSize:'13px'}}>Receive browser push notifications</p>
          </div>
          <button className="toggle-btn" onClick={() => handleToggle('push_notifications')}>
            <div className={`toggle-track ${settings.push_notifications ? 'active' : ''}`}>
              <div className="toggle-thumb"></div>
            </div>
            <span>{settings.push_notifications ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>

      <div className="detail-section">
        <h3 style={{marginBottom:'20px'}}>Language</h3>
        <div className="form-group" style={{maxWidth:'300px'}}>
          <label>Display Language</label>
          <select value={settings.language} onChange={handleLanguage} className="form-select">
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default Settings;
