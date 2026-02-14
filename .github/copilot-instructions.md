# Ephemeral Real-Time Chat Platform

## Project Overview
Real-time chat application where messages only exist while users are actively viewing them. No message persistence - all chats are ephemeral.

## Features
- User authentication (username/password)
- Real-time messaging via WebSocket
- Voice calling via WebRTC
- Ephemeral messages (no database storage)
- Active presence detection

## Tech Stack
- Backend: Node.js, Express, Socket.IO
- Frontend: React, Socket.IO-client, WebRTC
- Authentication: bcrypt, JWT
- Database: MongoDB (users only, no messages)

## Project Status
- [x] Create copilot instructions file
- [ ] Scaffold backend structure
- [ ] Scaffold frontend structure
- [ ] Implement authentication system
- [ ] Implement WebSocket chat
- [ ] Implement WebRTC voice calling
- [ ] Install dependencies
- [ ] Create documentation
