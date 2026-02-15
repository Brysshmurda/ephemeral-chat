import React, { useState, useEffect, useRef } from 'react';
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
  const [roomMetaByRoom, setRoomMetaByRoom] = useState({}); // roomName -> { ownerId, mutedUserIds[] }
  const [roomUsersByRoom, setRoomUsersByRoom] = useState({});
  const [roomMessagesByRoom, setRoomMessagesByRoom] = useState(() => loadSessionObject(ROOM_MESSAGES_STORAGE_KEY));
  const [showRoomInput, setShowRoomInput] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [roomError, setRoomError] = useState('');
  const [appNotice, setAppNotice] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [connectionErrorDetail, setConnectionErrorDetail] = useState('');
  const [socketTargetUrl, setSocketTargetUrl] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [directMessages, setDirectMessages] = useState(() => loadSessionObject(DM_MESSAGES_STORAGE_KEY)); // userId -> messages[]
  const [activeDM, setActiveDM] = useState(null); // userId of active DM conversation
  const [unreadRooms, setUnreadRooms] = useState({});
  const [mentionRooms, setMentionRooms] = useState({});
  const [unreadDMs, setUnreadDMs] = useState({});
  const currentRoomRef = useRef(null);
  const activeDMRef = useRef(null);

  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  useEffect(() => {
    activeDMRef.current = activeDM;
  }, [activeDM]);

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
    const serverUrl = configuredUrl || (isLocalhost ? 'http://localhost:5000' : '');
    setSocketTargetUrl(serverUrl || 'not-set');

    if (!serverUrl) {
      setConnectionStatus('config_error');
      setConnectionErrorDetail('Missing REACT_APP_API_URL for production build');
      return undefined;
    }

    if (window.location.protocol === 'https:' && serverUrl.startsWith('http://')) {
      setConnectionStatus('config_error');
      setConnectionErrorDetail('HTTPS page cannot connect to HTTP backend URL');
      return undefined;
    }

    const newSocket = io(serverUrl, {
      auth: { token },
      transports: ['websocket'],
      upgrade: false,
      timeout: 20000,
      reconnectionAttempts: 10
    });

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      setConnectionErrorDetail('');
      if (isDev) {
        console.log('Connected to server');
      }
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('reconnecting');
    });

    newSocket.on('connect_error', (error) => {
      const errorMessage = String(error?.message || '').toLowerCase();
      const detailedReason = [
        error?.message,
        error?.description,
        error?.context?.status,
        error?.type
      ].filter(Boolean).join(' | ');
      const isConfigIssue =
        errorMessage.includes('cors') ||
        errorMessage.includes('socket cors blocked') ||
        errorMessage.includes('authentication error') ||
        errorMessage.includes('invalid namespace') ||
        errorMessage.includes('parse error') ||
        errorMessage.includes('certificate') ||
        errorMessage.includes('mixed content');

      const isLikelyColdStart =
        errorMessage.includes('timeout') ||
        errorMessage.includes('xhr poll error') ||
        errorMessage.includes('websocket error') ||
        errorMessage.includes('transport error');

      if (isConfigIssue) {
        setConnectionStatus('config_error');
      } else if (isLikelyColdStart) {
        setConnectionStatus('waking');
      } else {
        setConnectionStatus('reconnecting');
      }

      setConnectionErrorDetail(detailedReason || 'Unknown connection error');
      if (isDev) {
        console.error('Connection error:', error);
      }
    });

    newSocket.io.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    // Room joined successfully
    newSocket.on('room_joined', ({ roomName, messages, users, ownerId, mutedUserIds = [] }) => {
      setJoinedRooms((prev) => (prev.includes(roomName) ? prev : [...prev, roomName]));
      setCurrentRoom(roomName);
      setRoomUsersByRoom((prev) => ({ ...prev, [roomName]: users }));
      setRoomMetaByRoom((prev) => ({ ...prev, [roomName]: { ownerId, mutedUserIds } }));
      setUnreadRooms((prev) => ({ ...prev, [roomName]: 0 }));
      setMentionRooms((prev) => ({ ...prev, [roomName]: 0 }));
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

      if (currentRoomRef.current !== roomName) {
        setUnreadRooms((prev) => ({
          ...prev,
          [roomName]: (prev[roomName] || 0) + 1
        }));

        if (
          typeof message?.message === 'string' &&
          message.senderId !== user.id &&
          message.message.toLowerCase().includes(`@${String(user.username).toLowerCase()}`)
        ) {
          setMentionRooms((prev) => ({
            ...prev,
            [roomName]: (prev[roomName] || 0) + 1
          }));
        }
      }
    });

    // User joined the room
    newSocket.on('user_joined_room', ({ username, users, roomName, ownerId, mutedUserIds = [] }) => {
      setRoomUsersByRoom((prev) => ({ ...prev, [roomName]: users }));
      setRoomMetaByRoom((prev) => ({ ...prev, [roomName]: { ownerId, mutedUserIds } }));
      if (isDev) {
        console.log(`${username} joined the room`);
      }
    });

    // User left the room
    newSocket.on('user_left_room', ({ username, users, roomName, ownerId, mutedUserIds = [] }) => {
      setRoomUsersByRoom((prev) => ({ ...prev, [roomName]: users }));
      setRoomMetaByRoom((prev) => ({ ...prev, [roomName]: { ownerId, mutedUserIds } }));
      if (isDev) {
        console.log(`${username} left the room`);
      }
    });

    newSocket.on('room_moderation_updated', ({ roomName, ownerId, mutedUserIds = [] }) => {
      setRoomMetaByRoom((prev) => ({ ...prev, [roomName]: { ownerId, mutedUserIds } }));
    });

    newSocket.on('room_cleared', ({ roomName }) => {
      if (!roomName) return;

      setRoomMessagesByRoom((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, roomName)) {
          return prev;
        }
        const next = { ...prev };
        delete next[roomName];
        return next;
      });

      setUnreadRooms((prev) => ({ ...prev, [roomName]: 0 }));
      setMentionRooms((prev) => ({ ...prev, [roomName]: 0 }));
    });

    newSocket.on('user_removed_from_room', ({ roomName }) => {
      setJoinedRooms((prev) => prev.filter((room) => room !== roomName));
      setRoomUsersByRoom((prev) => {
        const next = { ...prev };
        delete next[roomName];
        return next;
      });
      setRoomMetaByRoom((prev) => {
        const next = { ...prev };
        delete next[roomName];
        return next;
      });
      setAppNotice(`You were removed from room: ${roomName}`);

      if (currentRoomRef.current === roomName) {
        setCurrentRoom(null);
      }
    });

    newSocket.on('user_muted_in_room', ({ roomName }) => {
      setAppNotice(`You are muted in ${roomName} by the room owner.`);
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

      if (activeDMRef.current !== messageData.senderId) {
        setUnreadDMs((prev) => ({
          ...prev,
          [messageData.senderId]: (prev[messageData.senderId] || 0) + 1
        }));
      }
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
      newSocket.off('room_cleared');
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
      setUnreadRooms((prev) => ({ ...prev, [nextRoom]: 0 }));
      setMentionRooms((prev) => ({ ...prev, [nextRoom]: 0 }));
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

  const handleSelectRoom = (roomName) => {
    setCurrentRoom(roomName);
    setUnreadRooms((prev) => ({ ...prev, [roomName]: 0 }));
    setMentionRooms((prev) => ({ ...prev, [roomName]: 0 }));
  };

  const handleStartDM = (targetUser) => {
    // Set active DM conversation
    setActiveDM(targetUser.userId);
    setUnreadDMs((prev) => ({ ...prev, [targetUser.userId]: 0 }));
    
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

  const handleModerateMute = (targetUserId, shouldMute) => {
    if (!socket || !currentRoom) return;
    socket.emit('mute_user_in_room', {
      roomName: currentRoom,
      targetUserId,
      shouldMute
    });
  };

  const handleModerateRemove = (targetUserId) => {
    if (!socket || !currentRoom) return;
    socket.emit('remove_user_from_room', {
      roomName: currentRoom,
      targetUserId
    });
  };

  const currentRoomUsers = currentRoom ? (roomUsersByRoom[currentRoom] || []) : [];
  const currentRoomMessages = currentRoom ? (roomMessagesByRoom[currentRoom] || []) : [];
  const currentRoomMeta = currentRoom ? roomMetaByRoom[currentRoom] || { ownerId: null, mutedUserIds: [] } : { ownerId: null, mutedUserIds: [] };
  const isCurrentUserOwner = currentRoomMeta.ownerId === user.id;

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

        {connectionStatus !== 'connected' && (
          <div className="connection-banner">
            {connectionStatus === 'waking'
              ? 'Server waking up... reconnecting'
              : connectionStatus === 'config_error'
                ? 'Connection config issue (check API URL / CLIENT_URL)'
                : 'Reconnecting...'}
            {connectionErrorDetail ? ` • ${connectionErrorDetail}` : ''}
            {socketTargetUrl ? ` • socket: ${socketTargetUrl}` : ''}
          </div>
        )}

        {appNotice && (
          <div className="chat-notice info" style={{ margin: '8px 12px 0' }}>
            {appNotice}
          </div>
        )}

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
                      onClick={() => handleSelectRoom(room)}
                      title={`Open ${room}`}
                    >
                      {room}
                      {(unreadRooms[room] || 0) > 0 && (
                        <span className="room-unread-badge">{unreadRooms[room]}</span>
                      )}
                      {(mentionRooms[room] || 0) > 0 && (
                        <span className="room-mention-badge">@{mentionRooms[room]}</span>
                      )}
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
            <h4>Users in Room ({currentRoomUsers.length}) {isCurrentUserOwner ? '• Owner' : ''}</h4>
            {currentRoomUsers.map((roomUser) => (
              <div key={roomUser.userId} className="user-item">
                <div className="online-indicator"></div>
                <span>{roomUser.username}</span>
                {currentRoomMeta.ownerId === roomUser.userId && (
                  <span className="you-badge"> (owner)</span>
                )}
                {roomUser.userId === user.id && (
                  <span className="you-badge"> (you)</span>
                )}
                {currentRoomMeta.mutedUserIds.includes(roomUser.userId) && (
                  <span className="you-badge"> (muted)</span>
                )}
                {isCurrentUserOwner && roomUser.userId !== user.id && (
                  <div className="mod-controls">
                    <button
                      className="mod-btn"
                      onClick={() => handleModerateMute(roomUser.userId, !currentRoomMeta.mutedUserIds.includes(roomUser.userId))}
                    >
                      {currentRoomMeta.mutedUserIds.includes(roomUser.userId) ? 'Unmute' : 'Mute'}
                    </button>
                    <button className="mod-btn danger" onClick={() => handleModerateRemove(roomUser.userId)}>
                      Remove
                    </button>
                  </div>
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
                  {(unreadDMs[onlineUser.userId] || 0) > 0 && (
                    <span className="room-unread-badge">{unreadDMs[onlineUser.userId]}</span>
                  )}
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
            roomMeta={currentRoomMeta}
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
