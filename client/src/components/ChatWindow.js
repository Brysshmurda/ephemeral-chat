import React, { useState, useEffect, useRef } from 'react';

const ChatWindow = ({ socket, currentUser, roomName, messages: roomMessages, roomUsers }) => {
  const [messageInput, setMessageInput] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isInCall, setIsInCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callTarget, setCallTarget] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  useEffect(() => {
    // Listen for typing indicators
    socket.on('user_typing', (data) => {
      setTypingUsers(prev => new Set(prev).add(data.username));
    });

    socket.on('user_stopped_typing', (data) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.username);
        return newSet;
      });
    });

    // WebRTC call events
    socket.on('incoming_call', handleIncomingCall);
    socket.on('call_answered', handleCallAnswered);
    socket.on('ice_candidate', handleNewICECandidate);
    socket.on('call_ended', handleCallEnded);

    return () => {
      socket.off('user_typing');
      socket.off('user_stopped_typing');
      socket.off('incoming_call');
      socket.off('call_answered');
      socket.off('ice_candidate');
      socket.off('call_ended');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  useEffect(() => {
    scrollToBottom();
  }, [roomMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (messageInput.trim()) {
      socket.emit('send_message', {
        message: messageInput
      });
      setMessageInput('');
      socket.emit('typing_stop');
    }
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);

    socket.emit('typing_start');

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop');
    }, 1000);
  };

  // WebRTC Functions
  const startCall = async (targetUserId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', {
            targetUserId: targetUserId,
            candidate: event.candidate
          });
        }
      };

      peerConnection.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play();
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('call_user', {
        targetUserId: targetUserId,
        offer: offer
      });

      peerConnectionRef.current = peerConnection;
      setIsInCall(true);
      setCallTarget(targetUserId);
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const handleIncomingCall = async ({ from, fromUsername, offer }) => {
    setIncomingCall({ from, fromUsername, offer });
  };

  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', {
            targetUserId: incomingCall.from,
            candidate: event.candidate
          });
        }
      };

      peerConnection.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play();
      };

      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('answer_call', {
        targetUserId: incomingCall.from,
        answer: answer
      });

      peerConnectionRef.current = peerConnection;
      setIsInCall(true);
      setCallTarget(incomingCall.from);
      setIncomingCall(null);
    } catch (error) {
      console.error('Error accepting call:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const rejectCall = () => {
    socket.emit('end_call', { targetUserId: incomingCall.from });
    setIncomingCall(null);
  };

  const handleCallAnswered = async ({ answer }) => {
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleNewICECandidate = async ({ candidate }) => {
    try {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  const endCall = () => {
    if (callTarget) {
      socket.emit('end_call', { targetUserId: callTarget });
    }
    handleCallEnded();
  };

  const handleCallEnded = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    setIsInCall(false);
    setCallTarget(null);
    setIncomingCall(null);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const otherUsers = roomUsers.filter(u => u.userId !== currentUser.id);

  return (
    <>
      <div className="ephemeral-notice">
        ⚠️ This room is ephemeral - messages will disappear when everyone leaves
      </div>

      <div className="chat-header">
        <div>
          <h3>🏠 {roomName}</h3>
          <small style={{ color: '#4caf50' }}>{roomUsers.length} user{roomUsers.length !== 1 ? 's' : ''} in room</small>
        </div>
        {isInCall && (
          <button
            className="voice-call-btn calling"
            onClick={endCall}
          >
            📞 End Call
          </button>
        )}
      </div>

      <div className="messages-container">
        {roomMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
            <h3>Welcome to {roomName}!</h3>
            <p>No messages yet. Start the conversation!</p>
          </div>
        )}
        {roomMessages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.senderId === currentUser.id ? 'own' : ''}`}
          >
            <div className="message-content">
              <div className="message-sender">{msg.senderUsername}</div>
              <div className="message-text">{msg.message}</div>
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        ))}
        {typingUsers.size > 0 && (
          <div className="typing-indicator">
            {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="message-input-container" onSubmit={handleSendMessage}>
        <input
          type="text"
          className="message-input"
          placeholder="Type a message..."
          value={messageInput}
          onChange={handleTyping}
        />
        <button type="submit" className="send-btn">
          Send
        </button>
      </form>

      {/* Voice call menu */}
      {otherUsers.length > 0 && !isInCall && (
        <div className="voice-call-menu">
          <button className="voice-menu-toggle">
            📞 Call Someone
          </button>
          <div className="voice-call-dropdown">
            {otherUsers.map(user => (
              <button
                key={user.userId}
                className="call-user-btn"
                onClick={() => startCall(user.userId)}
              >
                Call {user.username}
              </button>
            ))}
          </div>
        </div>
      )}

      {incomingCall && (
        <div className="incoming-call-modal">
          <div className="incoming-call-content">
            <h3>📞 Incoming Call</h3>
            <p style={{ marginBottom: '20px', fontSize: '1.1rem' }}>
              {incomingCall.fromUsername} is calling you...
            </p>
            <div className="call-buttons">
              <button className="accept-call-btn" onClick={acceptCall}>
                Accept
              </button>
              <button className="reject-call-btn" onClick={rejectCall}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatWindow;
