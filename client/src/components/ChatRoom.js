import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import ChatWindow from './ChatWindow';

const ChatRoom = ({ user, token, onLogout }) => {
  const [socket, setSocket] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomUsers, setRoomUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [showRoomInput, setShowRoomInput] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [roomError, setRoomError] = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    // Connect to Socket.IO server
    const serverUrl = process.env.REACT_APP_API_URL || 'https://ephemeral-chat-server.onrender.com';
    const newSocket = io(serverUrl, {
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    // Room joined successfully
    newSocket.on('room_joined', ({ roomName, messages, users }) => {
      setCurrentRoom(roomName);
      setMessages(messages);
      setRoomUsers(users);
      setShowRoomInput(false);
      setNewRoomName('');
      setRoomError('');
      console.log(`Joined room: ${roomName}`);
    });

    // New message received
    newSocket.on('new_message', ({ message }) => {
      setMessages(prev => [...prev, message]);
    });

    // User joined the room
    newSocket.on('user_joined_room', ({ username, users }) => {
      setRoomUsers(users);
      console.log(`${username} joined the room`);
    });

    // User left the room
    newSocket.on('user_left_room', ({ username, users }) => {
      setRoomUsers(users);
      console.log(`${username} left the room`);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleJoinRoom = (roomName) => {
    const trimmedRoomName = roomName.trim();
    
    if (!trimmedRoomName) {
      setRoomError('Room name cannot be empty');
      return;
    }

    if (trimmedRoomName.length < 3) {
      setRoomError('Room name must be at least 3 characters');
      return;
    }

    if (trimmedRoomName.length > 30) {
      setRoomError('Room name must be less than 30 characters');
      return;
    }

    if (!/^[a-zA-Z0-9 _-]+$/.test(trimmedRoomName)) {
      setRoomError('Only letters, numbers, spaces, hyphens, and underscores allowed');
      return;
    }

    if (socket) {
      socket.emit('join_room', { roomName: trimmedRoomName });
    }
  };

  const handleRoomSubmit = (e) => {
    e.preventDefault();
    handleJoinRoom(newRoomName);
  };

  const handleSwitchRoom = () => {
    if (socket && currentRoom) {
      socket.emit('leave_room');
      setCurrentRoom(null);
      setMessages([]);
      setRoomUsers([]);
    }
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

        {/* Room Selector */}
        <div className="room-selector">
          <h4>🏠 Room</h4>
          {currentRoom ? (
            <>
              <div className="current-room-display">
                <span className="room-name-badge">{currentRoom}</span>
                <button 
                  className="switch-room-btn" 
                  onClick={handleSwitchRoom}
                  title="Switch to another room"
                >
                  🔄
                </button>
              </div>
            </>
          ) : (
            <div className="room-input-container">
              {!showRoomInput ? (
                <button 
                  className="join-room-trigger-btn" 
                  onClick={() => setShowRoomInput(true)}
                >
                  + Join/Create Room
                </button>
              ) : (
                <form onSubmit={handleRoomSubmit} className="room-input-form">
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => {
                      setNewRoomName(e.target.value);
                      setRoomError('');
                    }}
                    placeholder="Enter room name..."
                    className="room-name-input"
                    autoFocus
                  />
                  {roomError && (
                    <div className="room-error">{roomError}</div>
                  )}
                  <div className="room-input-buttons">
                    <button type="submit" className="room-submit-btn">
                      Join
                    </button>
                    <button 
                      type="button" 
                      className="room-cancel-btn"
                      onClick={() => {
                        setShowRoomInput(false);
                        setNewRoomName('');
                        setRoomError('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              <p className="room-hint">
                💡 Enter a room name to create or join. Share the name with friends!
              </p>
            </div>
          )}
        </div>

        {/* Room Users */}
        {currentRoom && (
          <div className="room-users">
            <h4>Users in Room ({roomUsers.length})</h4>
            {roomUsers.map((roomUser) => (
              <div key={roomUser.userId} className="user-item">
                <div className="online-indicator"></div>
                <span>{roomUser.username}</span>
                {roomUser.userId === user.id && (
                  <span className="you-badge"> (you)</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chat-main">
        {currentRoom ? (
          <ChatWindow
            socket={socket}
            currentUser={user}
            roomName={currentRoom}
            messages={messages}
            roomUsers={roomUsers}
          />
        ) : (
          <div className="no-chat-selected">
            <div>
              <h2>💬 Ephemeral Chat</h2>
              <p>👈 Join or create a room to start chatting</p>
              <div className="welcome-features">
                <h3>Features:</h3>
                <ul>
                  <li>🏠 Create unlimited ephemeral rooms</li>
                  <li>💬 Real-time messaging</li>
                  <li>📞 Group voice calls</li>
                  <li>🔥 Everything disappears when you leave</li>
                  <li>🚫 No data stored anywhere</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatRoom;
