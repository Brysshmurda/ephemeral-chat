import React, { useState, useEffect, useRef } from 'react';

const ChatWindow = ({ socket, currentUser, targetUser, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  const chatId = [currentUser.id, targetUser.userId].sort().join('_');

  useEffect(() => {
    // Listen for chat history
    socket.on('chat_history', (data) => {
      if (data.chatId === chatId) {
        setMessages(data.messages);
      }
    });

    // Listen for new messages
    socket.on('new_message', (data) => {
      if (data.chatId === chatId) {
        setMessages(prev => [...prev, data.message]);
      }
    });

    // Listen for typing indicators
    socket.on('user_typing', (data) => {
      if (data.userId === targetUser.userId) {
        setIsTyping(true);
      }
    });

    socket.on('user_stopped_typing', (data) => {
      if (data.userId === targetUser.userId) {
        setIsTyping(false);
      }
    });

    // WebRTC call events
    socket.on('incoming_call', handleIncomingCall);
    socket.on('call_answered', handleCallAnswered);
    socket.on('ice_candidate', handleNewICECandidate);
    socket.on('call_ended', handleCallEnded);

    return () => {
      socket.off('chat_history');
      socket.off('new_message');
      socket.off('user_typing');
      socket.off('user_stopped_typing');
      socket.off('incoming_call');
      socket.off('call_answered');
      socket.off('ice_candidate');
      socket.off('call_ended');
    };
  }, [socket, chatId, targetUser.userId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (messageInput.trim()) {
      socket.emit('send_message', {
        targetUserId: targetUser.userId,
        message: messageInput
      });
      setMessageInput('');
      socket.emit('typing_stop', { targetUserId: targetUser.userId });
    }
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);

    socket.emit('typing_start', { targetUserId: targetUser.userId });

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop', { targetUserId: targetUser.userId });
    }, 1000);
  };

  // WebRTC Functions
  const startCall = async () => {
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
            targetUserId: targetUser.userId,
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
        targetUserId: targetUser.userId,
        offer: offer
      });

      peerConnectionRef.current = peerConnection;
      setIsInCall(true);
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const handleIncomingCall = async ({ from, fromUsername, offer }) => {
    if (from === targetUser.userId) {
      setIncomingCall({ from, fromUsername, offer });
    }
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
    socket.emit('end_call', { targetUserId: targetUser.userId });
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
    setIncomingCall(null);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <div className="ephemeral-notice">
        ⚠️ This chat is ephemeral - messages will disappear when you close this window
      </div>

      <div className="chat-header">
        <div>
          <h3>{targetUser.username}</h3>
          <small style={{ color: '#4caf50' }}>● Online</small>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className={`voice-call-btn ${isInCall ? 'calling' : ''}`}
            onClick={isInCall ? endCall : startCall}
          >
            {isInCall ? '📞 End Call' : '📞 Voice Call'}
          </button>
          <button
            className="logout-btn"
            onClick={onClose}
            style={{ background: '#f44336' }}
          >
            Close Chat
          </button>
        </div>
      </div>

      <div className="messages-container">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
            No messages yet. Start the conversation!
          </div>
        )}
        {messages.map((msg) => (
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
        {isTyping && (
          <div className="typing-indicator">
            {targetUser.username} is typing...
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
