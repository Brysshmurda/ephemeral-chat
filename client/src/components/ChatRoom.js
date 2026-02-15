import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import ChatWindow from './ChatWindow';

const ROOM_MESSAGES_STORAGE_KEY = 'ghost_chat_room_messages';
const DM_MESSAGES_STORAGE_KEY = 'ghost_chat_dm_messages';

const loadSessionObject = (key) => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
};

const ChatRoom = ({ user, token, onLogout }) => {
  const isDev = process.env.NODE_ENV === 'development';
  const [socket, setSocket] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [joinedRooms, setJoinedRooms] = useState([]);
  const [roomUsersByRoom, setRoomUsersByRoom] = useState({});
  const [roomMessagesByRoom, setRoomMessagesByRoom] = useState(() => loadSessionObject(ROOM_MESSAGES_STORAGE_KEY));
  const [showRoomInput, setShowRoomInput] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [roomError, setRoomError] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [directMessages, setDirectMessages] = useState(() => loadSessionObject(DM_MESSAGES_STORAGE_KEY)); // userId -> messages[]
  const [activeDM, setActiveDM] = useState(null); // userId of active DM conversation

  useEffect(() => {
    sessionStorage.setItem(ROOM_MESSAGES_STORAGE_KEY, JSON.stringify(roomMessagesByRoom));
  }, [roomMessagesByRoom]);

  useEffect(() => {
    sessionStorage.setItem(DM_MESSAGES_STORAGE_KEY, JSON.stringify(directMessages));
  }, [directMessages]);

  useEffect(() => {
    // Connect to Socket.IO server
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const configuredUrl = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/$/, '') : '';
    const serverUrl = configuredUrl || (isLocalhost ? 'http://localhost:5000' : window.location.origin);
    const newSocket = io(serverUrl, {
      auth: { token }
    });

    newSocket.on('connect', () => {
      if (isDev) {
        console.log('Connected to server');
      }
    });

    newSocket.on('connect_error', (error) => {
      if (isDev) {
        console.error('Connection error:', error);
      }
    });

    // Room joined successfully
    newSocket.on('room_joined', ({ roomName, messages, users }) => {
      setJoinedRooms((prev) => (prev.includes(roomName) ? prev : [...prev, roomName]));
      setCurrentRoom(roomName);
      setRoomUsersByRoom((prev) => ({ ...prev, [roomName]: users }));
      setRoomMessagesByRoom((prev) => {
        if (prev[roomName]) {
          return prev;
        }
        return { ...prev, [roomName]: messages || [] };
      });
      setShowRoomInput(false);
      setNewRoomName('');
      setRoomError('');
      if (isDev) {
        console.log(`Joined room: ${roomName}`);
      }
    });

    // New message received
    newSocket.on('new_message', ({ roomName, message }) => {
      setRoomMessagesByRoom((prev) => {
        const roomMessages = prev[roomName] || [];
        return {
          ...prev,
          [roomName]: [...roomMessages, message]
        };
      });
    });

    // User joined the room
    newSocket.on('user_joined_room', ({ username, users, roomName }) => {
      setRoomUsersByRoom((prev) => ({ ...prev, [roomName]: users }));
      if (isDev) {
        console.log(`${username} joined the room`);
      }
    });

    // User left the room
    newSocket.on('user_left_room', ({ username, users, roomName }) => {
      setRoomUsersByRoom((prev) => ({ ...prev, [roomName]: users }));
      if (isDev) {
        console.log(`${username} left the room`);
      }
    });

    // Online users list
    newSocket.on('online_users', (users) => {
      setOnlineUsers(users.filter(u => u.userId !== user.id));
    });

    // Direct message received
    newSocket.on('direct_message_received', (messageData) => {
      setDirectMessages((prev) => {
        const userId = messageData.senderId;
        const existingMessages = prev[userId] || [];
        return {
          ...prev,
          [userId]: [...existingMessages, messageData]
        };
      });
    });

    // Direct message sent (confirmation)
    newSocket.on('direct_message_sent', (messageData) => {
      setDirectMessages((prev) => {
        const userId = messageData.targetUserId;
        const existingMessages = prev[userId] || [];
        return {
          ...prev,
          [userId]: [...existingMessages, messageData]
        };
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isDev]);

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
    if (joinedRooms.length > 1 && currentRoom) {
      const currentIndex = joinedRooms.indexOf(currentRoom);
      const nextRoom = joinedRooms[(currentIndex + 1) % joinedRooms.length];
      setCurrentRoom(nextRoom);
    }
  };

  const handleLeaveRoom = (roomName) => {
    if (!socket) return;

    socket.emit('leave_room', { roomName });

    setJoinedRooms((prev) => prev.filter((room) => room !== roomName));
    setRoomUsersByRoom((prev) => {
      const next = { ...prev };
      delete next[roomName];
      return next;
    });

    if (currentRoom === roomName) {
      const remainingRooms = joinedRooms.filter((room) => room !== roomName);
      setCurrentRoom(remainingRooms[0] || null);
    }
  };

  const handleStartDM = (targetUser) => {
    // Set active DM conversation
    setActiveDM(targetUser.userId);
    
    // Initialize DM conversation if it doesn't exist
    if (!directMessages[targetUser.userId]) {
      setDirectMessages((prev) => {
        return {
          ...prev,
          [targetUser.userId]: []
        };
      });
    }
  };

  const currentRoomUsers = currentRoom ? (roomUsersByRoom[currentRoom] || []) : [];
  const currentRoomMessages = currentRoom ? (roomMessagesByRoom[currentRoom] || []) : [];

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
          <h4>🏠 Rooms ({joinedRooms.length})</h4>
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

            {joinedRooms.length > 0 && (
              <div className="joined-rooms-list">
                {joinedRooms.map((room) => (
                  <div key={room} className={`joined-room-item ${currentRoom === room ? 'active' : ''}`}>
                    <button
                      className="joined-room-name"
                      onClick={() => setCurrentRoom(room)}
                      title={`Open ${room}`}
                    >
                      {room}
                    </button>
                    <button
                      className="joined-room-leave"
                      onClick={() => handleLeaveRoom(room)}
                      title={`Leave ${room}`}
                    >
                      ✖
                    </button>
                  </div>
                ))}
              </div>
            )}

            {joinedRooms.length > 1 && (
              <button
                className="switch-room-btn"
                onClick={handleSwitchRoom}
                title="Switch to next joined room"
              >
                🔄 Switch Room
              </button>
            )}

            <p className="room-hint">
              💡 You can stay in multiple rooms at once and switch anytime.
            </p>
          </div>
        </div>

        {/* Room Users */}
        {currentRoom && (
          <div className="room-users">
            <h4>Users in Room ({currentRoomUsers.length})</h4>
            {currentRoomUsers.map((roomUser) => (
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

        {/* Online Users - DM Capability */}
        <div className="online-users">
          <h4>🟢 Online Users ({onlineUsers.length})</h4>
          {onlineUsers.length === 0 ? (
            <p className="no-users">No other users online</p>
          ) : (
            <div className="users-list">
              {onlineUsers.map((onlineUser) => (
                <div 
                  key={onlineUser.userId} 
                  className={`user-item clickable ${activeDM === onlineUser.userId ? 'active-dm' : ''}`}
                  onClick={() => handleStartDM(onlineUser)}
                  title={`Click to message ${onlineUser.username}`}
                >
                  <div className="online-indicator"></div>
                  <span>{onlineUser.username}</span>
                  {directMessages[onlineUser.userId] && directMessages[onlineUser.userId].length > 0 && (
                    <span className="dm-badge">💬</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="chat-main">
        {currentRoom ? (
          <ChatWindow
            socket={socket}
            currentUser={user}
            roomName={currentRoom}
            messages={currentRoomMessages}
            roomUsers={currentRoomUsers}
            isDM={false}
          />
        ) : activeDM ? (
          <ChatWindow
            socket={socket}
            currentUser={user}
            targetUserId={activeDM}
            targetUsername={onlineUsers.find(u => u.userId === activeDM)?.username}
            messages={directMessages[activeDM] || []}
            roomUsers={[]}
            isDM={true}
            onCloseDM={() => setActiveDM(null)}
          />
        ) : (
          <div className="no-chat-selected">
            <div>
              <h2>💬 Ghost Chat</h2>
              <p>👈 Join a room or message a user to start chatting</p>
              <div className="welcome-features">
                <h3>Features:</h3>
                <ul>
                  <li>🏠 Create unlimited ephemeral rooms</li>
                  <li>💬 Real-time messaging</li>
                  <li>📞 Group voice/video calls in rooms</li>
                  <li>✉️ Direct message online users</li>
                  <li>🔥 Messages disappear when you close the tab</li>
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
