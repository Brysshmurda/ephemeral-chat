# Ghost Chat 👻

Real-time chat platform focused on privacy and ephemerality.

Ghost Chat keeps activity in memory only, supports live room chat + DMs, and includes WebRTC calling with voice-first join, camera toggle, mute/deafen, and screen sharing.

## Features

- Username-only session auth (no long-term account persistence)
- Real-time room chat and direct messages with Socket.IO
- Multi-room membership (join multiple rooms and switch instantly)
- Voice-first calls with live controls:
  - Mute / Unmute
  - Deafen / Undeafen
  - Camera On / Off
  - Screen Share (screen/window) / Stop Share
- Media messages: emoji, GIF URL, and image upload
- Ephemeral message behavior:
  - Messages persist while tab is open
  - Messages disappear when tab closes
- Privacy-focused logging (sensitive logs disabled by default)

## Tech Stack

### Frontend
- React
- Socket.IO Client
- WebRTC API
- Axios

### Backend
- Node.js
- Express
- Socket.IO
- JWT
- In-memory storage only (no message database)

## Project Structure

```text
.
├─ client/
│  ├─ public/
│  └─ src/
│     ├─ components/
│     │  ├─ Auth.js
│     │  ├─ ChatRoom.js
│     │  └─ ChatWindow.js
│     ├─ api.js
│     ├─ App.js
│     └─ App.css
└─ server/
   ├─ models/
   ├─ routes/
   │  └─ auth.js
   ├─ sockets/
   │  └─ socketHandler.js
   └─ server.js
```

## Local Setup

### Prerequisites

- Node.js 18+
- npm

### 1) Install dependencies

```bash
cd server
npm install

cd ../client
npm install
```

### 2) Configure environment

Server `.env` example:

```env
PORT=5000
JWT_SECRET=change_this_in_production
CLIENT_URL=http://localhost:3000
NODE_ENV=development
LOG_LEVEL=none
ENABLE_DIAGNOSTIC_LOGS=false

# Optional debug logging (privacy-safe default is false)
SOCKET_DEBUG_LOGS=false
AUTH_DEBUG_LOGS=false
```

Client `.env` (optional):

```env
REACT_APP_API_URL=http://localhost:5000
```

### 3) Run the app

Backend:

```bash
cd server
npm start
```

Frontend (new terminal):

```bash
cd client
npm start
```

App runs at `http://localhost:3000`.

## Deployment

Use the included guides:

- [DEPLOYMENT-SIMPLE.md](DEPLOYMENT-SIMPLE.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [SETUP-FOR-FRIENDS.md](SETUP-FOR-FRIENDS.md)

Recommended free setup:
- Backend on Render
- Frontend on Vercel

## Privacy Notes

- Messages are not stored in a database.
- User sessions are ephemeral (reset on server restart).
- Set `LOG_LEVEL=none` to suppress nearly all server logs.
- Sensitive socket/auth logs are off by default.

## Troubleshooting

### Camera / Mic / Screen Share
- Ensure browser permissions are granted.
- Use HTTPS in production (required by browser media APIs).
- Try Chrome/Edge for most consistent screen-share behavior.

### Socket connection issues
- Confirm frontend `REACT_APP_API_URL` points to your Render backend.
- Confirm backend `CLIENT_URL` matches your Vercel domain exactly.

### Changes not showing
- Hard refresh (`Ctrl+F5`) after deploy to clear cached bundles.

## Status

Actively evolving. Recent updates include:
- UI refresh
- voice-first call controls
- media messaging
- improved privacy logging
