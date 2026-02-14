# 💬 Ephemeral Real-Time Chat Platform

A unique real-time chat application where messages only exist while users are actively viewing them. All chats are completely ephemeral - close a chat and the messages disappear forever!

## ✨ Features

- **Session-Based Accounts**: Create a username when you join - gone when server restarts
- **Real-Time Messaging**: Instant message delivery using WebSocket (Socket.IO)
- **Voice Calling**: WebRTC-based voice calls between users
- **Fully Ephemeral**: Messages AND accounts only exist in memory
- **Active Presence**: See who's online in real-time
- **Typing Indicators**: Know when someone is typing
- **Zero Persistence**: Nothing is saved - anywhere!

## 🛠️ Tech Stack

### Backend
- Node.js
- Express.js
- Socket.IO (WebSocket)
- In-memory storage (NO database!)
- JWT (session tokens)

### Frontend
- React
- Socket.IO Client
- WebRTC API
- Axios

## 📋 Prerequisites

Before running this application, make sure you have:

- Node.js (v14 or higher)
- npm or yarn

**That's it!** No database needed - everything runs in memory.

## 🚀 Installation & Setup

### 1. Clone or Navigate to the Project

```bash
cd "c:\Users\brys\Desktop\new chat platform idea"
```

### 2. Set Up the Backend

```bash
cd server
npm install
```
 (Optional)

The `.env` file is already set up. You can customize:

```env
PORT=5000
JWT_SECRET=ephemeral_secret_key_no_database_needed
CLIENT_URL=http://localhost:3000
```

### 4
### 5. Set Up the Frontend

```bash
cd ../client
npm install
```

## 🏃 Running the Application

### Start the Backend Server

```bash
cd server
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

The server will start on `http://localhost:5000`

### Start the Frontend

In a new terminal:

```bash
cd client
npm start
```

The React app will open at `http://localhost:3000`

## 📖 How to Use

1. **Register an Account**
   - Open the app in your browser
   - Click "Register" and create a username and password
   - Username: 3-20 characters
   - Password: minimum 6 characters

2. **Login**
   - Use your credentials to log in
   - You'll see the main chat interface

3. **Start Chatting**
   - See online users in the left sidebar
   - Click on a user to open a chat
   - Type and send messages in real-time
   - Messages appear instantly for both users

4. **Create a Session Account**
   - Open the app in your browser
   - Click "Register" and create a username and password
   - These credentials exist ONLY until the server restarts
   - No email needed - just a username!

2. **Login**
   - Use your session credentials to log in
   - If server restarts, you'll need to register again window is open
   - Close a chat → all messages in that chat are deleted
   - If both users close the chat, it's gone forever
   - If you're not actively viewing a chat, you won't see new messages

## 🎯 Key Concepts

### Ephemeral Messaging
- **No Database Storage**: Messages are never saved to a database
- **Active Window Required**: You must have the chat window open to see messages
- **Immediate Deletion**: Closing a chat deletes all messages instantly
- **No History**: Reopening a chat starts fresh with no history

### Active Presence
- Users only appear online when connected
- Chats only exist when at least one user is viewing them
- True real-time communication

## 📁 Project Structure

```
new chat platform idea/
├── server/                 # Backend application
│   Fully Ephemeral System(Not used - no database!)
│   ├── routes/            # API routes (ephemeral n server memory only
- **User Accounts**: Exist only during the current server session
- **Messages**: Exist only while chat windows are open
- **Server Restart**: Wipes everything - accounts, messages, all data

### Ephemeral Messaging
- **Active Window Required**: You must have the chat window open to see messages
- **Immediate Deletion**: Closing a chat deletes all messages instantly
- **No History**: Reopening a chat starts fresh with no history

### Active Presence
- Users only appear online when connected
- Chats only exist when at least one user is viewing them
- True real-time, temporary
│   │   ├── components/   # React components
│   │   │   ├── Auth.js          # Login/Register
│   │   │   ├── ChatRoom.js      # Main chat interface
│   │   │   └── ChatWindow.js    # Individual chat window
│   │   ├── App.js        # Main app component
│   │   ├── App.css       # Styles
│   │   └── index.js      # Entry point
│   └── package.json
│
└─Session passwords stored in plain text in memory (cleared on restart)
- JWT tokens for authentication
- CORS configured for client-server communication
- WebRTC uses STUN servers for NAT traversal
- Everything is ephemeral - no data persists
- Passwords are hashed using bcryptjs
- JWT tokens for authentication
- Change `JWT_SECRET` in production
- COServer Won't Start
- Check if port 5000 is available
- Make sure you ran `npm install` in the server directory

### MongoDB Connection Issues
- Ensure MongoDB is running
- Check the `MONGODB_URI` in `.env`
- For Atlas, whitelist your IP address

### WebRTC Voice Call Issues
- Grant microphone permissions in your browser
- Check browser console for errors
- Ensure both users are on modern browsers (Chrome, Firefox, Edge)

### Socket.IO Connection Issues
- Check that backend is running on port 5000
- Verify frontend proxy in `client/package.json`
- Check browser console for connection errors

## 🎨 Customization

### Change Server Port
Update `PORT` in `server/.env` and update the socket connection in `client/src/components/ChatRoom.js`

### Styling
Modify `client/src/App.css` for custom styling

### Add Features
- Extend `server/sockets/socketHandler.js` for new socket events
- Create new React components in `client/src/components/`

## 📝 License

This project is open source and available for educational purposes.

## 🤝 Contributing

Feel free to fork this project and add your own features!

---

## 🌐 Deploying Online (Share with Friends)

Want to share this with friends? Deploy it online!

**Easiest Option:** Railway (all-in-one deployment)  
**Free Option:** Render + Vercel (free forever)

📚 **Deployment Guides:**
- [SETUP-FOR-FRIENDS.md](SETUP-FOR-FRIENDS.md) - Complete walkthrough
- [DEPLOYMENT-SIMPLE.md](DEPLOYMENT-SIMPLE.md) - Quick reference (5 min)
- [DEPLOYMENT.md](DEPLOYMENT.md) - Detailed guide with all options

---

**Remember**: This is a truly ephemeral chat - messages exist only in the moment. Perfect for private, temporary conversations! 🔒✨
