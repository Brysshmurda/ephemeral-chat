const jwt = require('jsonwebtoken');

const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const diagnosticsEnabled = process.env.ENABLE_DIAGNOSTIC_LOGS === 'true';
const shouldDebugLog = diagnosticsEnabled && process.env.SOCKET_DEBUG_LOGS === 'true' && logLevel === 'debug';

const maskId = (value) => {
  const stringValue = String(value || 'unknown');
  if (stringValue.length <= 8) return stringValue;
  return `${stringValue.slice(0, 4)}...${stringValue.slice(-4)}`;
};

const debugLog = (event, details = {}) => {
  if (!shouldDebugLog) return;
  console.log(`[socket] ${event}`, details);
};

// In-memory storage for active users
// Structure: { userId: { socketId, username, joinedRooms: Set[roomName] } }
const activeUsers = new Map();

// Structure: { roomName: { ownerId, users: Set[userId], activeCall: Set[userId], mutedUsers: Set[userId] } }
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
    debugLog('user_connected', { userId: maskId(socket.userId) });

    // Add user to active users
    activeUsers.set(socket.userId, {
      socketId: socket.id,
      username: socket.username,
      joinedRooms: new Set()
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

      // Create room if doesn't exist
      if (!rooms.has(roomName)) {
        rooms.set(roomName, {
          ownerId: socket.userId,
          users: new Set(),
          activeCall: new Set(),
          mutedUsers: new Set()
        });
        debugLog('room_created', { roomLength: roomName.length });
      }

      const room = rooms.get(roomName);
      room.users.add(socket.userId);
      user.joinedRooms.add(roomName);

      // Join the socket room
      socket.join(roomName);

      // Send room data (messages are client-ephemeral per tab session)
      socket.emit('room_joined', {
        roomName,
        messages: [],
        users: getRoomUsers(roomName),
        ownerId: room.ownerId,
        mutedUserIds: Array.from(room.mutedUsers)
      });

      // Notify others in the room
      socket.to(roomName).emit('user_joined_room', {
        userId: socket.userId,
        username: socket.username,
        roomName,
        users: getRoomUsers(roomName),
        ownerId: room.ownerId,
        mutedUserIds: Array.from(room.mutedUsers)
      });

      debugLog('room_joined', { userId: maskId(socket.userId), roomLength: roomName.length });
    });

    // Leave room
    socket.on('leave_room', ({ roomName }) => {
      const user = activeUsers.get(socket.userId);
      if (user && roomName && user.joinedRooms.has(roomName)) {
        leaveRoom(socket, roomName);
      }
    });

    socket.on('mute_user_in_room', ({ roomName, targetUserId, shouldMute }) => {
      const room = rooms.get(roomName);
      const requester = activeUsers.get(socket.userId);
      if (!room || !requester || !requester.joinedRooms.has(roomName)) return;
      if (room.ownerId !== socket.userId) return;
      if (!room.users.has(targetUserId) || targetUserId === socket.userId) return;

      if (shouldMute) {
        room.mutedUsers.add(targetUserId);
      } else {
        room.mutedUsers.delete(targetUserId);
      }

      io.to(roomName).emit('room_moderation_updated', {
        roomName,
        ownerId: room.ownerId,
        mutedUserIds: Array.from(room.mutedUsers)
      });
    });

    socket.on('remove_user_from_room', ({ roomName, targetUserId }) => {
      const room = rooms.get(roomName);
      const requester = activeUsers.get(socket.userId);
      const targetUser = activeUsers.get(targetUserId);
      if (!room || !requester || !targetUser) return;
      if (room.ownerId !== socket.userId) return;
      if (!requester.joinedRooms.has(roomName) || !targetUser.joinedRooms.has(roomName)) return;
      if (targetUserId === socket.userId) return;

      io.to(targetUser.socketId).emit('user_removed_from_room', { roomName });
      leaveRoomByUserId(targetUserId, roomName);
    });

    // Send message to room
    socket.on('send_message', ({ roomName, message, messageType = 'text' }) => {
      const user = activeUsers.get(socket.userId);
      if (!user || !roomName || !user.joinedRooms.has(roomName)) return;

      const room = rooms.get(roomName);
      if (!room) return;

      if (room.mutedUsers.has(socket.userId)) {
        socket.emit('user_muted_in_room', { roomName });
        return;
      }

      const messageData = {
        id: Date.now() + Math.random(),
        senderId: socket.userId,
        senderUsername: socket.username,
        message,
        messageType,
        timestamp: new Date().toISOString()
      };

      // Send message to all users in the room
      io.to(roomName).emit('new_message', {
        roomName,
        message: messageData
      });

    });

    // Send direct message to specific user
    socket.on('send_direct_message', ({ targetUserId, message, messageType = 'text' }) => {
      const targetUser = activeUsers.get(targetUserId);
      const sender = activeUsers.get(socket.userId);
      
      if (!targetUser || !sender) return;

      const messageData = {
        id: Date.now() + Math.random(),
        senderId: socket.userId,
        senderUsername: sender.username,
        targetUserId: targetUserId,
        message,
        messageType,
        timestamp: new Date().toISOString()
      };

      // Send to target user
      io.to(targetUser.socketId).emit('direct_message_received', messageData);

      // Send back to sender as confirmation
      socket.emit('direct_message_sent', messageData);

    });

    // Typing indicator for room
    socket.on('typing_start', ({ roomName }) => {
      const user = activeUsers.get(socket.userId);
      if (user && roomName && user.joinedRooms.has(roomName)) {
        socket.to(roomName).emit('user_typing', {
          userId: socket.userId,
          username: socket.username,
          roomName
        });
      }
    });

    socket.on('typing_stop', ({ roomName }) => {
      const user = activeUsers.get(socket.userId);
      if (user && roomName && user.joinedRooms.has(roomName)) {
        socket.to(roomName).emit('user_stopped_typing', {
          userId: socket.userId,
          username: socket.username,
          roomName
        });
      }
    });

    // Group call - Join call
    socket.on('join_call', ({ roomName }) => {
      const user = activeUsers.get(socket.userId);
      if (!user || !roomName || !user.joinedRooms.has(roomName)) return;

      const room = rooms.get(roomName);
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
        roomName,
        participants: currentParticipants
      });

      // Notify all other participants that a new user joined
      socket.to(roomName).emit('user_joined_call', {
        userId: socket.userId,
        username: socket.username,
        roomName
      });

      debugLog('call_joined', { userId: maskId(socket.userId), roomLength: roomName.length });
    });

    // Group call - Leave call
    socket.on('leave_call', ({ roomName }) => {
      const user = activeUsers.get(socket.userId);
      if (!user || !roomName || !user.joinedRooms.has(roomName)) return;

      const room = rooms.get(roomName);
      if (!room) return;

      room.activeCall.delete(socket.userId);

      // Notify all participants that user left
      socket.to(roomName).emit('user_left_call', {
        userId: socket.userId,
        roomName
      });

      debugLog('call_left', { userId: maskId(socket.userId), roomLength: roomName.length });
    });

    // WebRTC signaling for group calls
    socket.on('webrtc_offer', ({ targetUserId, offer, roomName }) => {
      const targetUser = activeUsers.get(targetUserId);
      const user = activeUsers.get(socket.userId);
      
      // Only allow calls if both users are in the same room
      if (
        targetUser &&
        user &&
        roomName &&
        user.joinedRooms.has(roomName) &&
        targetUser.joinedRooms.has(roomName)
      ) {
        io.to(targetUser.socketId).emit('webrtc_offer', {
          from: socket.userId,
          roomName,
          offer
        });
      }
    });

    socket.on('webrtc_answer', ({ targetUserId, answer, roomName }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('webrtc_answer', {
          from: socket.userId,
          roomName,
          answer
        });
      }
    });

    socket.on('webrtc_ice_candidate', ({ targetUserId, candidate, roomName }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('webrtc_ice_candidate', {
          from: socket.userId,
          roomName,
          candidate
        });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      debugLog('user_disconnected', { userId: maskId(socket.userId) });

      const user = activeUsers.get(socket.userId);
      if (user) {
        const joinedRooms = Array.from(user.joinedRooms);
        joinedRooms.forEach((roomName) => leaveRoom(socket, roomName));
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
        userId: socket.userId,
        roomName
      });
    }

    room.mutedUsers.delete(socket.userId);
    room.users.delete(socket.userId);
    user.joinedRooms.delete(roomName);
    socket.leave(roomName);

    // Notify others in the room
    socket.to(roomName).emit('user_left_room', {
      userId: socket.userId,
      username: socket.username,
      roomName,
      users: getRoomUsers(roomName),
      ownerId: room.ownerId,
      mutedUserIds: Array.from(room.mutedUsers)
    });

    // If room is empty, delete it
    if (room.users.size === 0) {
      rooms.delete(roomName);
      debugLog('room_deleted', { roomLength: roomName.length });
    } else {
      if (room.ownerId === socket.userId) {
        room.ownerId = Array.from(room.users)[0] || null;
        io.to(roomName).emit('room_moderation_updated', {
          roomName,
          ownerId: room.ownerId,
          mutedUserIds: Array.from(room.mutedUsers)
        });
      }
      debugLog('room_left', { userId: maskId(socket.userId), roomLength: roomName.length });
    }
  }

  function leaveRoomByUserId(userId, roomName) {
    const room = rooms.get(roomName);
    const targetUser = activeUsers.get(userId);
    if (!room || !targetUser) return;

    if (room.activeCall.has(userId)) {
      room.activeCall.delete(userId);
      io.to(roomName).emit('user_left_call', {
        userId,
        roomName
      });
    }

    room.mutedUsers.delete(userId);
    room.users.delete(userId);
    targetUser.joinedRooms.delete(roomName);
    io.sockets.sockets.get(targetUser.socketId)?.leave(roomName);

    io.to(roomName).emit('user_left_room', {
      userId,
      username: targetUser.username,
      roomName,
      users: getRoomUsers(roomName),
      ownerId: room.ownerId,
      mutedUserIds: Array.from(room.mutedUsers)
    });

    if (room.users.size === 0) {
      rooms.delete(roomName);
      return;
    }

    if (room.ownerId === userId) {
      room.ownerId = Array.from(room.users)[0] || null;
    }

    io.to(roomName).emit('room_moderation_updated', {
      roomName,
      ownerId: room.ownerId,
      mutedUserIds: Array.from(room.mutedUsers)
    });
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
