const jwt = require('jsonwebtoken');

// In-memory storage for active users and their chats
// Structure: { userId: { socketId, username, activeChats: Set[chatId] } }
const activeUsers = new Map();

// Structure: { chatId: { users: Set[userId], messages: [] } }
const activeChats = new Map();

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
      activeChats: new Set()
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

    // Open chat with another user
    socket.on('open_chat', ({ targetUserId }) => {
      const chatId = getChatId(socket.userId, targetUserId);
      
      // Add this chat to user's active chats
      const user = activeUsers.get(socket.userId);
      if (user) {
        user.activeChats.add(chatId);
      }

      // Initialize chat if it doesn't exist
      if (!activeChats.has(chatId)) {
        activeChats.set(chatId, {
          users: new Set([socket.userId, targetUserId]),
          messages: []
        });
      }

      // Join the socket room for this chat
      socket.join(chatId);

      // Send existing messages for this chat (only if chat is active)
      const chat = activeChats.get(chatId);
      socket.emit('chat_history', {
        chatId,
        messages: chat.messages
      });

      console.log(`📂 ${socket.username} opened chat: ${chatId}`);
    });

    // Close chat
    socket.on('close_chat', ({ chatId }) => {
      const user = activeUsers.get(socket.userId);
      if (user) {
        user.activeChats.delete(chatId);
      }

      socket.leave(chatId);

      // Check if anyone else is viewing this chat
      const chat = activeChats.get(chatId);
      if (chat) {
        const isAnyoneViewing = Array.from(chat.users).some(userId => {
          const user = activeUsers.get(userId);
          return user && user.activeChats.has(chatId);
        });

        // If no one is viewing this chat, delete it
        if (!isAnyoneViewing) {
          activeChats.delete(chatId);
          console.log(`🗑️  Chat deleted (no active viewers): ${chatId}`);
        }
      }

      console.log(`📁 ${socket.username} closed chat: ${chatId}`);
    });

    // Send message
    socket.on('send_message', ({ targetUserId, message }) => {
      const chatId = getChatId(socket.userId, targetUserId);
      const chat = activeChats.get(chatId);

      if (!chat) {
        return; // Chat doesn't exist, message is lost (ephemeral)
      }

      const messageData = {
        id: Date.now() + Math.random(),
        senderId: socket.userId,
        senderUsername: socket.username,
        message,
        timestamp: new Date().toISOString()
      };

      // Only store message if chat is active
      chat.messages.push(messageData);

      // Send message to all users in this chat room
      io.to(chatId).emit('new_message', {
        chatId,
        message: messageData
      });

      console.log(`💬 Message in ${chatId}: ${socket.username}: ${message}`);
    });

    // WebRTC signaling for voice calls
    socket.on('call_user', ({ targetUserId, offer }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('incoming_call', {
          from: socket.userId,
          fromUsername: socket.username,
          offer
        });
      }
    });

    socket.on('answer_call', ({ targetUserId, answer }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('call_answered', {
          from: socket.userId,
          answer
        });
      }
    });

    socket.on('ice_candidate', ({ targetUserId, candidate }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('ice_candidate', {
          from: socket.userId,
          candidate
        });
      }
    });

    socket.on('end_call', ({ targetUserId }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('call_ended', {
          from: socket.userId
        });
      }
    });

    // Typing indicator
    socket.on('typing_start', ({ targetUserId }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('user_typing', {
          userId: socket.userId,
          username: socket.username
        });
      }
    });

    socket.on('typing_stop', ({ targetUserId }) => {
      const targetUser = activeUsers.get(targetUserId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('user_stopped_typing', {
          userId: socket.userId
        });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.username}`);

      // Get user's active chats before removing
      const user = activeUsers.get(socket.userId);
      if (user && user.activeChats) {
        // Close all active chats
        user.activeChats.forEach(chatId => {
          const chat = activeChats.get(chatId);
          if (chat) {
            const isAnyoneElseViewing = Array.from(chat.users).some(userId => {
              if (userId === socket.userId) return false;
              const otherUser = activeUsers.get(userId);
              return otherUser && otherUser.activeChats.has(chatId);
            });

            // If no one else is viewing, delete the chat
            if (!isAnyoneElseViewing) {
              activeChats.delete(chatId);
              console.log(`🗑️  Chat deleted on disconnect: ${chatId}`);
            }
          }
        });
      }

      // Remove user from active users
      activeUsers.delete(socket.userId);

      // Broadcast updated online users
      broadcastOnlineUsers();
    });
  });

  function broadcastOnlineUsers() {
    const onlineUsers = Array.from(activeUsers.entries()).map(([userId, data]) => ({
      userId,
      username: data.username
    }));
    io.emit('online_users', onlineUsers);
  }

  function getChatId(userId1, userId2) {
    return [userId1, userId2].sort().join('_');
  }
};
