import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://localhost:4103/api';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/login`, { email, password });
      onLogin(response.data.user, response.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoFill = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/default-credentials`);
      setEmail(response.data.email);
      setPassword(response.data.password);
    } catch (err) {
      setEmail('admin@manufacturing.com');
      setPassword('admin123');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>AI Manufacturing Ops</h1>
          <p>Sign in to your account</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              aria-label="Email address"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              aria-label="Password"
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <button type="button" className="auto-fill-btn" onClick={handleAutoFill}>
            Auto-fill Demo Credentials
          </button>
        </form>

        <div className="auth-links">
          <Link to="/register">Create an account</Link>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        <div className="auth-footer">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <span>|</span>
          <Link to="/terms-of-service">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
