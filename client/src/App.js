import React, { useState, useEffect } from 'react';
import './App.css';
import Auth from './components/Auth';
import ChatRoom from './components/ChatRoom';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    // Check if user is already logged in
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(token);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <div className="App">
      {!user ? (
        <Auth onLogin={handleLogin} />
      ) : (
        <ChatRoom user={user} token={token} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
