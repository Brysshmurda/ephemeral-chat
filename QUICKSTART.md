# 🚀 Quick Start Guide

This guide will get you up and running with the Ghost Chat app in 2 minutes!

## Prerequisites Checklist

- [ ] Node.js installed (check: `node --version`)
- [ ] Two terminal windows open

**No database needed!** Everything runs in memory.

## Step 1: Start the Backend Server

**Terminal 1:**
```bash
cd server
npm start
```

You should see:
```
🔥 Running in FULLY EPHEMERAL mode - no database!
🚀 Server running on port 5000
```

## Step 2: Start the Frontend

**Terminal 2:**
```bash
cd client
npm start
```

Your bro3ser should automatically open to `http://localhost:3000`

## Step 4: Test the App

1. **Create two accounts:**
   - Open `http://localhost:3000` in your main browser
   - Click "Register" and create an account (e.g., "Alice")
   - Open `http://localhost:3000` in an incognito/private window
   - Create another account (e.g., "Bob")

2. **Start chatting:**
   - Both users should see each other in the "Online Users" list
   - Click on a user to open a chat
   - Type messages - they appear instantly!

3. **Test voice calling:**
   - Click the "Voice Call" button in any chat
   - Accept the call on the other user's window
   - Talk! (Make sure to allow microphone access)

4. **See the ephemeral nature:**
   - Close a chat window by clicking "Close Chat"
   - Reopen it - all messages are gone! ✨

## Troubleshooting

### "Port 5000 already in use"
- Change the port in `server/.env`
- Update the socket URL in `client/src/components/ChatRoom.js`

### "WebRTC not working"
- Allow microphone permissions
- Use Chrome, Firefox, or Edge (Safari has limited support)
- Make sure you're on `localhost` (WebRTC requires secure context)

## What Makes This App Special?

🔥 **Messages exist ONLY while viewing:**
- Open chat → messages load
- Close chat → messages deleted
- No history, no traces
FULLY EPHEMERAL:**
- User accounts exist only in memory
- Server restart = everyone needs to re-register
- No database, no persistence, no traces

💬 **
💬 **Real-time everything:**
- Instant message delivery
- Live typing indicators
- Active presence detection

🎙️ **Voice calls:**
- WebRTC peer-to-peer voice calls
- No server processing of audio
- Direct browser-to-browser connection

## Next Steps

- Open the [README.md](README.md) for full documentation
- Customize the styling in `client/src/App.css`
- Add new features by extending the Socket.IO handlers
- Deploy to production (remember to change JWT_SECRET!)

---

**Enjoy your truly ephemeral conversations! 🚀✨**

---

## 🌐 Want to Share with Friends Online?

See [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) for step-by-step deployment guide!
