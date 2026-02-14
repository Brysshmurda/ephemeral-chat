import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import ChatWindow from './ChatWindow';
import RoomJoin from './RoomJoin';

const ChatRoom = ({ user, token, onLogout }) => {
  const [socket, setSocket] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomUsers, setRoomUsers] = useState([]);
  const [messages, setMessages] = useState([]);
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
    if (socket) {
      socket.emit('join_room', { roomName });
    }
  };

  const handleLeaveRoom = () => {
    if (socket && currentRoom) {
      socket.emit('leave_room');
      setCurrentRoom(null);
      setMessages([]);
      setRoomUsers([]);
    }
  };

  return (
    <div className="chat-container">
      {!currentRoom ? (
        <div className="room-join-wrapper">
          <div className="room-join-header">
            <div className="user-info">
              <span>Logged in as: <strong>{user.username}</strong></span>
            </div>
            <button className="logout-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
          <RoomJoin onJoinRoom={handleJoinRoom} />
        </div>
      ) : (
        <>
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

            <div className="current-room">
              <div className="room-name-header">
                <h4>🏠 Current Room</h4>
                <button className="leave-room-btn" onClick={handleLeaveRoom}>
                  Leave Room
                </button>
              </div>
              <div className="room-name">{currentRoom}</div>
            </div>

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
          </div>

          <div className="chat-main">
            <ChatWindow
              socket={socket}
              currentUser={user}
              roomName={currentRoom}
              messages={messages}
              roomUsers={roomUsers}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ChatRoom;
