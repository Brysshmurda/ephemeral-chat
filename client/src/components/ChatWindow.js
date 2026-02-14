import React, { useState, useEffect, useRef } from 'react';

const ChatWindow = ({ socket, currentUser, roomName, messages: roomMessages, roomUsers }) => {
  const [messageInput, setMessageInput] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isInCall, setIsInCall] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // Map of userId -> RTCPeerConnection
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

    // Group call events
    socket.on('call_participants', handleCallParticipants);
    socket.on('user_joined_call', handleUserJoinedCall);
    socket.on('user_left_call', handleUserLeftCall);
    socket.on('webrtc_offer', handleWebRTCOffer);
    socket.on('webrtc_answer', handleWebRTCAnswer);
    socket.on('webrtc_ice_candidate', handleWebRTCIceCandidate);

    return () => {
      socket.off('user_typing');
      socket.off('user_stopped_typing');
      socket.off('call_participants');
      socket.off('user_joined_call');
      socket.off('user_left_call');
      socket.off('webrtc_offer');
      socket.off('webrtc_answer');
      socket.off('webrtc_ice_candidate');
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

  // Group call functions
  const joinCall = async () => {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      setIsInCall(true);

      // Notify server that we're joining the call
      socket.emit('join_call');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const leaveCall = () => {
    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => {
      pc.close();
    });
    peerConnectionsRef.current.clear();

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setIsInCall(false);

    // Notify server
    socket.emit('leave_call');
  };

  // Called when we first join a call - get list of existing participants
  const handleCallParticipants = async ({ participants }) => {
    // Create peer connections with all existing participants
    for (const participant of participants) {
      await createPeerConnection(participant.userId, true);
    }
  };

  // Called when another user joins the call
  const handleUserJoinedCall = async ({ userId }) => {
    if (userId !== currentUser.id && isInCall) {
      await createPeerConnection(userId, true);
    }
  };

  // Called when a user leaves the call
  const handleUserLeftCall = ({ userId }) => {
    const pc = peerConnectionsRef.current.get(userId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(userId);
    }
  };

  // Create a peer connection with another user
  const createPeerConnection = async (userId, shouldCreateOffer) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc_ice_candidate', {
          targetUserId: userId,
          candidate: event.candidate
        });
      }
    };

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play();
    };

    peerConnectionsRef.current.set(userId, peerConnection);

    // Create and send offer if we're the initiator
    if (shouldCreateOffer) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('webrtc_offer', {
        targetUserId: userId,
        offer: offer
      });
    }

    return peerConnection;
  };

  // Handle incoming WebRTC offer
  const handleWebRTCOffer = async ({ from, offer }) => {
    if (!isInCall) return;

    const peerConnection = await createPeerConnection(from, false);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('webrtc_answer', {
      targetUserId: from,
      answer: answer
    });
  };

  // Handle incoming WebRTC answer
  const handleWebRTCAnswer = async ({ from, answer }) => {
    const peerConnection = peerConnectionsRef.current.get(from);
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  // Handle incoming ICE candidate
  const handleWebRTCIceCandidate = async ({ from, candidate }) => {
    const peerConnection = peerConnectionsRef.current.get(from);
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const callParticipantsCount = peerConnectionsRef.current.size + (isInCall ? 1 : 0);

  return (
    <>
      <div className="ephemeral-notice">
        ⚠️ This room is ephemeral - messages will disappear when everyone leaves
      </div>

      <div className="chat-header">
        <div>
          <h3>🏠 {roomName}</h3>
          <small style={{ color: '#4caf50' }}>
            {roomUsers.length} user{roomUsers.length !== 1 ? 's' : ''} in room
            {isInCall && ` • ${callParticipantsCount} in call`}
          </small>
        </div>
        <button
          className={`voice-call-btn ${isInCall ? 'calling' : ''}`}
          onClick={isInCall ? leaveCall : joinCall}
        >
          {isInCall ? '📞 Leave Call' : '📞 Join Voice Call'}
        </button>
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
    </>
  );
};

export default ChatWindow;
