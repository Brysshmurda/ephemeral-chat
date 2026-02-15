import React, { useState, useEffect, useRef } from 'react';

const ChatWindow = ({ socket, currentUser, roomName, messages: roomMessages, roomUsers, isDM = false, targetUserId, targetUsername, onCloseDM }) => {
  const [messageInput, setMessageInput] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isInCall, setIsInCall] = useState(false);
  const [callMode, setCallMode] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [gifUrlInput, setGifUrlInput] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const noticeTimeoutRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // Map of roomName:userId -> RTCPeerConnection
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);

  const showNotice = (message, type = 'info') => {
    setNotice(message);
    setNoticeType(type);

    clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => {
      setNotice('');
    }, 3200);
  };

  useEffect(() => {
    // Listen for typing indicators
    socket.on('user_typing', (data) => {
      if (isDM || (data.roomName && data.roomName !== roomName)) return;
      setTypingUsers(prev => new Set(prev).add(data.username));
    });

    socket.on('user_stopped_typing', (data) => {
      if (isDM || (data.roomName && data.roomName !== roomName)) return;
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        if (data.username) {
          newSet.delete(data.username);
        }
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
      clearTimeout(noticeTimeoutRef.current);
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
  }, [socket, roomName, isDM, isInCall]);

  useEffect(() => {
    return () => {
      leaveCall(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  useEffect(() => {
    if (callMode === 'video' && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
  }, [callMode, isInCall]);

  useEffect(() => {
    scrollToBottom();
  }, [roomMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    const trimmedMessage = messageInput.trim();
    if (trimmedMessage) {
      if (isDM) {
        socket.emit('send_direct_message', {
          targetUserId: targetUserId,
          message: trimmedMessage,
          messageType: 'text'
        });
      } else {
        socket.emit('send_message', {
          roomName,
          message: trimmedMessage,
          messageType: 'text'
        });
        socket.emit('typing_stop', { roomName });
      }
      setMessageInput('');
    }
  };

  const sendMediaMessage = ({ message, messageType }) => {
    if (!message) return;

    if (isDM) {
      socket.emit('send_direct_message', {
        targetUserId,
        message,
        messageType
      });
      return;
    }

    socket.emit('send_message', {
      roomName,
      message,
      messageType
    });
  };

  const handleSendGif = () => {
    const trimmedGifUrl = gifUrlInput.trim();
    if (!trimmedGifUrl) return;

    if (!/^https?:\/\//i.test(trimmedGifUrl)) {
      showNotice('Please paste a valid GIF URL starting with http/https.', 'error');
      return;
    }

    sendMediaMessage({
      message: trimmedGifUrl,
      messageType: 'gif'
    });
    setGifUrlInput('');
    showNotice('GIF sent.', 'success');
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotice('Please choose an image file.', 'error');
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showNotice('Image must be 2MB or less.', 'error');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      sendMediaMessage({
        message: reader.result,
        messageType: 'image'
      });
      showNotice('Image sent.', 'success');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const insertEmoji = (emoji) => {
    setMessageInput((prev) => `${prev}${emoji}`);
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);

    if (!isDM) {
      socket.emit('typing_start', { roomName });

      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing_stop', { roomName });
      }, 1000);
    }
  };

  // Group call functions
  const joinCall = async (withVideo = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo
      });

      if (withVideo) {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          showNotice('Camera was not found. Joined as voice call.', 'error');
        }
      }

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      setIsInCall(true);
      setCallMode(withVideo ? 'video' : 'audio');

      // Notify server that we're joining the call
      socket.emit('join_call', { roomName });
    } catch (error) {
      showNotice('Could not access microphone/camera. Please check browser permissions.', 'error');
    }
  };

  const leaveCall = (notifyServer = true) => {
    // Close peer connections for current room
    Array.from(peerConnectionsRef.current.entries()).forEach(([key, pc]) => {
      if (key.startsWith(`${roomName}:`)) {
        pc.close();
        peerConnectionsRef.current.delete(key);
      }
    });

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setRemoteStreams({});

    setIsInCall(false);
    setCallMode(null);

    // Notify server
    if (notifyServer && !isDM) {
      socket.emit('leave_call', { roomName });
    }
  };

  // Called when we first join a call - get list of existing participants
  const handleCallParticipants = async ({ participants, roomName: eventRoomName }) => {
    if (eventRoomName && eventRoomName !== roomName) return;

    // Create peer connections with all existing participants
    for (const participant of participants) {
      await createPeerConnection(participant.userId, true);
    }
  };

  // Called when another user joins the call
  const handleUserJoinedCall = async ({ userId, roomName: eventRoomName }) => {
    if (eventRoomName && eventRoomName !== roomName) return;
    if (userId === currentUser.id || !isInCall) return;

    await createPeerConnection(userId, false);
  };

  // Called when a user leaves the call
  const handleUserLeftCall = ({ userId, roomName: eventRoomName }) => {
    if (eventRoomName && eventRoomName !== roomName) return;

    const connectionKey = `${roomName}:${userId}`;
    const pc = peerConnectionsRef.current.get(connectionKey);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(connectionKey);
    }

    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  // Create a peer connection with another user
  const createPeerConnection = async (userId, shouldCreateOffer) => {
    const connectionKey = `${roomName}:${userId}`;
    const existingConnection = peerConnectionsRef.current.get(connectionKey);
    if (existingConnection) {
      return existingConnection;
    }

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
          roomName,
          candidate: event.candidate
        });
      }
    };

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      setRemoteStreams((prev) => ({
        ...prev,
        [userId]: event.streams[0]
      }));
    };

    peerConnection.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(peerConnection.connectionState)) {
        peerConnectionsRef.current.delete(connectionKey);
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }
    };

    peerConnectionsRef.current.set(connectionKey, peerConnection);

    // Create and send offer if we're the initiator
    if (shouldCreateOffer) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('webrtc_offer', {
        targetUserId: userId,
        roomName,
        offer: offer
      });
    }

    return peerConnection;
  };

  // Handle incoming WebRTC offer
  const handleWebRTCOffer = async ({ from, offer, roomName: eventRoomName }) => {
    if (eventRoomName && eventRoomName !== roomName) return;
    if (!isInCall) return;

    const peerConnection = await createPeerConnection(from, false);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('webrtc_answer', {
      targetUserId: from,
      roomName,
      answer: answer
    });
  };

  // Handle incoming WebRTC answer
  const handleWebRTCAnswer = async ({ from, answer, roomName: eventRoomName }) => {
    if (eventRoomName && eventRoomName !== roomName) return;

    const peerConnection = peerConnectionsRef.current.get(`${roomName}:${from}`);
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  // Handle incoming ICE candidate
  const handleWebRTCIceCandidate = async ({ from, candidate, roomName: eventRoomName }) => {
    if (eventRoomName && eventRoomName !== roomName) return;

    const peerConnection = peerConnectionsRef.current.get(`${roomName}:${from}`);
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        showNotice('Connection quality issue detected. Retrying media path...', 'error');
      }
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const callParticipantsCount = Object.keys(remoteStreams).length + (isInCall ? 1 : 0);

  const renderMessageBody = (msg) => {
    const messageText = typeof msg.message === 'string' ? msg.message : '';
    const isImageDataUrl = messageText.startsWith('data:image/');
    const isGifUrl = /\.gif($|\?)/i.test(messageText);
    const mediaType = msg.messageType || (isImageDataUrl ? 'image' : (isGifUrl ? 'gif' : 'text'));

    if (mediaType === 'image' || mediaType === 'gif') {
      return (
        <img
          src={msg.message}
          alt="shared media"
          className="message-image"
        />
      );
    }

    return <div className="message-text">{msg.message}</div>;
  };

  return (
    <>
      <div className="ephemeral-notice">
        {isDM 
          ? '⚠️ Direct messages stay while this tab is open and disappear when it closes'
          : '⚠️ Room messages stay while this tab is open and disappear when it closes'
        }
      </div>

      {notice && (
        <div className={`chat-notice ${noticeType}`}>
          {notice}
        </div>
      )}

      <div className="chat-header">
        <div>
          {isDM ? (
            <>
              <h3>💬 {targetUsername}</h3>
              <small style={{ color: '#4caf50' }}>Direct Message</small>
              {onCloseDM && (
                <button 
                  className="close-dm-btn" 
                  onClick={onCloseDM}
                  style={{ marginLeft: '15px', padding: '5px 12px', fontSize: '12px' }}
                >
                  ✖ Close
                </button>
              )}
            </>
          ) : (
            <>
              <h3>🏠 {roomName}</h3>
              <small style={{ color: '#4caf50' }}>
                {roomUsers.length} user{roomUsers.length !== 1 ? 's' : ''} in room
                {isInCall && ` • ${callParticipantsCount} in call`}
              </small>
            </>
          )}
        </div>
        {!isDM && (
          <div className="call-controls">
            {isInCall ? (
              <button
                className="voice-call-btn calling"
                onClick={() => leaveCall(true)}
              >
                📞 Leave {callMode === 'video' ? 'Video' : 'Voice'} Call
              </button>
            ) : (
              <>
                <button
                  className="voice-call-btn"
                  onClick={() => joinCall(false)}
                >
                  📞 Join Voice
                </button>
                <button
                  className="voice-call-btn video"
                  onClick={() => joinCall(true)}
                >
                  📹 Join Video
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!isDM && isInCall && (
        <div className="video-grid">
          {callMode === 'video' && (
            <div className="video-tile">
              <video ref={localVideoRef} autoPlay muted playsInline className="remote-video" />
              <span className="video-label">You</span>
            </div>
          )}
          {Object.entries(remoteStreams).map(([userId, stream]) => (
            <div key={userId} className="video-tile">
              <video
                autoPlay
                playsInline
                className="remote-video"
                ref={(element) => {
                  if (element) {
                    element.srcObject = stream;
                  }
                }}
              />
              <span className="video-label">User {userId}</span>
            </div>
          ))}
        </div>
      )}

      <div className="messages-container">
        {roomMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
            {isDM ? (
              <>
                <h3>Start a conversation with {targetUsername}</h3>
                <p>Send a message to begin!</p>
              </>
            ) : (
              <>
                <h3>Welcome to {roomName}!</h3>
                <p>No messages yet. Start the conversation!</p>
              </>
            )}
          </div>
        )}
        {roomMessages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.senderId === currentUser.id ? 'own' : ''}`}
          >
            <div className="message-content">
              <div className="message-sender">{msg.senderUsername}</div>
              {renderMessageBody(msg)}
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

      <div className="media-toolbar">
        <div className="emoji-buttons">
          {['😀', '😂', '❤️', '👍', '🔥', '🎉'].map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="emoji-btn"
              onClick={() => insertEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="gif-input-row">
          <input
            type="url"
            className="gif-input"
            placeholder="Paste GIF URL"
            value={gifUrlInput}
            onChange={(e) => setGifUrlInput(e.target.value)}
          />
          <button type="button" className="send-btn media" onClick={handleSendGif}>Send GIF</button>
          <label className="image-upload-btn">
            📷 Image
            <input type="file" accept="image/*" onChange={handleImageUpload} />
          </label>
        </div>
      </div>

      <form className="message-input-container" onSubmit={handleSendMessage}>
        <input
          type="text"
          className="message-input"
          placeholder="Type a message..."
          value={messageInput}
          onChange={handleTyping}
        />
        <button type="submit" className="send-btn">Send</button>
      </form>
    </>
  );
};

export default ChatWindow;
