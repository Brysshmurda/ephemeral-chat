import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import ChatWindow from './ChatWindow';

const ChatRoom = ({ user, token, onLogout }) => {
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeChats, setActiveChats] = useState(new Map());
  const [selectedUser, setSelectedUser] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Connect to Socket.IO server
    // Use environment variable for production, fallback to localhost for development
    const serverUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const newSocket = io(serverUrl, {
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      newSocket.emit('get_online_users');
    });

    newSocket.on('online_users', (users) => {
      setOnlineUsers(users.filter(u => u.userId !== user.id));
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token, user.id]);

  const handleUserClick = (clickedUser) => {
    setSelectedUser(clickedUser);

    // Open chat if not already open
    if (!activeChats.has(clickedUser.userId)) {
      socket.emit('open_chat', { targetUserId: clickedUser.userId });
      setActiveChats(prev => new Map(prev).set(clickedUser.userId, {
        user: clickedUser,
        messages: []
      }));
    }
  };

  const handleCloseChat = (userId) => {
    socket.emit('close_chat', { chatId: getChatId(user.id, userId) });
    
    const newChats = new Map(activeChats);
    newChats.delete(userId);
    setActiveChats(newChats);

    if (selectedUser?.userId === userId) {
      setSelectedUser(null);
    }
  };

  const getChatId = (userId1, userId2) => {
    return [userId1, userId2].sort().join('_');
  };

  return (
    <div className="chat-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="user-info">
            <h3>{user.username}</h3>
            <span>Online</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>

        <div className="online-users">
          <h4>Online Users ({onlineUsers.length})</h4>
          {onlineUsers.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              No other users online
            </div>
          )}
          {onlineUsers.map((onlineUser) => (
            <div
              key={onlineUser.userId}
              className={`user-item ${selectedUser?.userId === onlineUser.userId ? 'active' : ''}`}
              onClick={() => handleUserClick(onlineUser)}
            >
              <div className="online-indicator"></div>
              <span>{onlineUser.username}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-main">
        {selectedUser ? (
          <ChatWindow
            socket={socket}
            currentUser={user}
            targetUser={selectedUser}
            onClose={() => handleCloseChat(selectedUser.userId)}
          />
        ) : (
          <div className="no-chat-selected">
            <div>
              <h2>💬 Ephemeral Chat</h2>
              <p>Select a user to start chatting</p>
              <p style={{ fontSize: '0.9rem', marginTop: '10px', color: '#ccc' }}>
                Remember: Messages disappear when you close the chat!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatRoom;
