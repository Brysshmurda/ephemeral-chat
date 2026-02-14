const jwt = require('jsonwebtoken');

// In-memory storage for active users
// Structure: { userId: { socketId, username, currentRoom: roomName } }
const activeUsers = new Map();

// Structure: { roomName: { users: Set[userId], messages: [], activeCall: Set[userId] } }
const rooms = new Map();

module.exports = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.username} (${socket.userId})`);

    // Add user to active users
    activeUsers.set(socket.userId, {
      socketId: socket.id,
      username: socket.username,
      currentRoom: null
    });

    // Broadcast online users to all clients
    broadcastOnlineUsers();

    // Get online users
    socket.on('get_online_users', () => {
      const onlineUsers = Array.from(activeUsers.entries()).map(([userId, data]) => ({
        userId,
        username: data.username
      }));
      socket.emit('online_users', onlineUsers);
    });

    // Create or join a room
    socket.on('join_room', ({ roomName }) => {
      const user = activeUsers.get(socket.userId);
      if (!user) return;

      // Leave current room if in one
      if (user.currentRoom) {
        leaveRoom(socket, user.currentRoom);
      }

      // Create room if doesn't exist
      if (!rooms.has(roomName)) {
        rooms.set(roomName, {
          users: new Set(),
          messages: [],
          activeCall: new Set()
        });
        console.log(`🏠 Room created: ${roomName}`);
      }

      const room = rooms.get(roomName);
      room.users.add(socket.userId);
      user.currentRoom = roomName;

      // Join the socket room
      socket.join(roomName);

      // Send existing messages for this room
      socket.emit('room_joined', {
        roomName,
        messages: room.messages,
        users: getRoomUsers(roomName)
      });

      // Notify others in the room
      socket.to(roomName).emit('user_joined_room', {
        userId: socket.userId,
        username: socket.username,
        users: getRoomUsers(roomName)
      });

      console.log(`✅ ${socket.username} joined room: ${roomName}`);
    });

    // Leave room
    socket.on('leave_room', () => {
      const user = activeUsers.get(socket.userId);
      if (user && user.currentRoom) {
        leaveRoom(socket, user.currentRoom);
      }
    });

    // Send message to room
    socket.on('send_message', ({ message }) => {
      const user = activeUsers.get(socket.userId);
      if (!user || !user.currentRoom) return;

      const room = rooms.get(user.currentRoom);
      if (!room) return;

      const messageData = {
        id: Date.now() + Math.random(),
        senderId: socket.userId,
        senderUsername: socket.username,
        message,
        timestamp: new Date().toISOString()
      };

      // Store message in room
      room.messages.push(messageData);

      // Send message to all users in the room
      io.to(user.currentRoom).emit('new_message', {
        roomName: user.currentRoom,
        message: messageData
      });

      console.log(`💬 Message in ${user.currentRoom}: ${socket.username}: ${message}`);
    });

    // Typing indicator for room
    socket.on('typing_start', () => {
      const user = activeUsers.get(socket.userId);
      if (user && user.currentRoom) {
        socket.to(user.currentRoom).emit('user_typing', {
          userId: socket.userId,
          username: socket.username
        });
      }
    });

    socket.on('typing_stop', () => {
      const user = activeUsers.get(socket.userId);
      if (user && user.currentRoom) {
        socket.to(user.currentRoom).emit('user_stopped_typing', {
          userId: socket.userId
        });
      }
    });

    // Group call - Join call
    socket.on('join_call', () => {
      const user = activeUsers.get(socket.userId);
      if (!user || !user.currentRoom) return;

      const room = rooms.get(user.currentRoom);
      if (!room) return;

      // Get current call participants before adding this user
      const currentParticipants = Array.from(room.activeCall).map(userId => {
        const participant = activeUsers.get(userId);
        return participant ? { userId, username: participant.username } : null;
      }).filter(Boolean);

      // Add user to active call
      room.activeCall.add(socket.userId);

      // Notify the joining user of all current participants
      socket.emit('call_participants', {
        participants: currentParticipants
      });

      // Notify all other participants that a new user joined
      socket.to(user.currentRoom).emit('user_joined_call', {
        userId: socket.userId,
        username: socket.username
      });

      console.log(`📞 ${socket.username} joined call in ${user.currentRoom}`);
    });

    // Group call - Leave call
    socket.on('leave_call', () => {
      const user = activeUsers.get(socket.userId);
      if (!user || !user.currentRoom) return;

      const room = rooms.get(user.currentRoom);
      if (!room) return;

      room.activeCall.delete(socket.userId);

      // Notify all participants that user left
      socket.to(user.currentRoom).emit('user_left_call', {
        userId: socket.userId
      });

      console.log(`📞 ${socket.username} left call in ${user.currentRoom}`);
    });

    // WebRTC signaling for group calls
    socket.on('webrtc_offer', ({ targetUserId, offer }) => {
      const targetUser = activeUsers.get(targetUserId);
      const user = activeUsers.get(socket.userId);
      
      // Only allow calls if both users are in the same room
      if (targetUser && user && targetUser.currentRoom === user.currentRoom) {
        io.to(targetUser.socketId).emit('webrtc_offer', {
          from: socket.userId,
          offer
        });
      }
    });

    socket.on('webrtc_answer', ({ targetUserId, answer }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('webrtc_answer', {
          from: socket.userId,
          answer
        });
      }
    });

    socket.on('webrtc_ice_candidate', ({ targetUserId, candidate }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('webrtc_ice_candidate', {
          from: socket.userId,
          candidate
        });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.username}`);

      const user = activeUsers.get(socket.userId);
      if (user && user.currentRoom) {
        leaveRoom(socket, user.currentRoom);
      }

      // Remove user from active users
      activeUsers.delete(socket.userId);

      // Broadcast updated online users
      broadcastOnlineUsers();
    });
  });

  // Helper function to leave a room
  function leaveRoom(socket, roomName) {
    const room = rooms.get(roomName);
    const user = activeUsers.get(socket.userId);
    
    if (!room || !user) return;

    // Remove from active call if in one
    if (room.activeCall.has(socket.userId)) {
      room.activeCall.delete(socket.userId);
      socket.to(roomName).emit('user_left_call', {
        userId: socket.userId
      });
    }

    room.users.delete(socket.userId);
    user.currentRoom = null;
    socket.leave(roomName);

    // Notify others in the room
    socket.to(roomName).emit('user_left_room', {
      userId: socket.userId,
      username: socket.username,
      users: getRoomUsers(roomName)
    });

    // If room is empty, delete it
    if (room.users.size === 0) {
      rooms.delete(roomName);
      console.log(`🗑️  Room deleted (empty): ${roomName}`);
    } else {
      console.log(`👋 ${socket.username} left room: ${roomName}`);
    }
  }

  // Get list of users in a room
  function getRoomUsers(roomName) {
    const room = rooms.get(roomName);
    if (!room) return [];

    return Array.from(room.users).map(userId => {
      const user = activeUsers.get(userId);
      return user ? { userId, username: user.username } : null;
    }).filter(Boolean);
  }

  function broadcastOnlineUsers() {
    const onlineUsers = Array.from(activeUsers.entries()).map(([userId, data]) => ({
      userId,
      username: data.username
    }));
    io.emit('online_users', onlineUsers);
  }
};
