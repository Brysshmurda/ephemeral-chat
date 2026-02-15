import React, { useState } from 'react';
import api from '../api';

const Auth = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/api/auth/register', { username });
      onLogin(response.data.token, response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Cannot connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h1 className="auth-title">💬 Ghost Chat</h1>
      
      <div style={{ textAlign: 'center', marginBottom: '25px', color: '#667eea', fontSize: '1.1rem', fontWeight: '600' }}>
        Join the Chat
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Choose a Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            required
            minLength={3}
            maxLength={20}
            autoFocus
          />
          <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '5px' }}>
            3-20 characters, no password needed
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? 'Joining...' : 'Join Chat'}
        </button>
      </form>

      <div style={{ marginTop: '25px', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
        <strong>🔥 FULLY EPHEMERAL:</strong> No registration required!
        <div style={{ marginTop: '8px', fontSize: '0.85rem', lineHeight: '1.5' }}>
          • Messages disappear when chats close<br/>
          • Usernames reset when server restarts<br/>
          • No data stored anywhere
        </div>
      </div>
    </div>
  );
};

export default Auth;
