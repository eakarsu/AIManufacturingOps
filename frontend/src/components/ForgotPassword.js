import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://localhost:4103/api';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
      setMessage(response.data.message);
      if (response.data.token) setToken(response.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Request failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>AI Manufacturing Ops</h1>
          <p>Reset your password</p>
        </div>
        {error && <div className="error-message">{error}</div>}
        {message && (
          <div className="success-message">
            <p>{message}</p>
            {token && (
              <p style={{marginTop:'12px', fontSize:'12px', wordBreak:'break-all'}}>
                Demo reset link: <Link to={`/reset-password/${token}`}>/reset-password/{token.substring(0,20)}...</Link>
              </p>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" required />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
        <div className="auth-links">
          <Link to="/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
