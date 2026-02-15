import React, { useState, useEffect, useRef } from 'react';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ChatWindow = ({ socket, currentUser, roomName, messages: roomMessages, roomUsers, roomMeta, isDM = false, targetUserId, targetUsername, onCloseDM }) => {
  const [messageInput, setMessageInput] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteMediaControls, setRemoteMediaControls] = useState({});
  const [focusedMediaUserId, setFocusedMediaUserId] = useState(null);
  const [showPreflight, setShowPreflight] = useState(false);
  const [preflightChecks, setPreflightChecks] = useState({ mic: 'untested', camera: 'untested', screen: 'untested' });
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState(false);
  const [isPTTPressed, setIsPTTPressed] = useState(false);
  const [peerQuality, setPeerQuality] = useState({});
  const [gifUrlInput, setGifUrlInput] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const noticeTimeoutRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // Map of roomName:userId -> RTCPeerConnection
  const localStreamRef = useRef(null);
  const localCameraVideoRef = useRef(null);
  const localScreenVideoRef = useRef(null);
  const remoteVideoRefs = useRef({});
  const focusedVideoRef = useRef(null);
  const audioTrackRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);

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
    if (!isInCall) return;

    if (localCameraVideoRef.current) {
      if ((isCameraOn || cameraTrackRef.current?.enabled) && localStreamRef.current) {
        localCameraVideoRef.current.srcObject = localStreamRef.current;
        localCameraVideoRef.current.play().catch(() => {});
      } else {
        localCameraVideoRef.current.srcObject = null;
      }
    }

    if (localScreenVideoRef.current) {
      if (isScreenSharing && screenTrackRef.current) {
        localScreenVideoRef.current.srcObject = new MediaStream([screenTrackRef.current]);
        localScreenVideoRef.current.play().catch(() => {});
      } else {
        localScreenVideoRef.current.srcObject = null;
      }
    }
  }, [isInCall, isCameraOn, isScreenSharing]);

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([userId, stream]) => {
      const controls = remoteMediaControls[userId] || {
        isVisible: true,
        volume: 1,
        isMuted: false,
        zoom: 1
      };

      const videoElement = remoteVideoRefs.current[userId];
      if (videoElement && controls.isVisible) {
        if (videoElement.srcObject !== stream) {
          videoElement.srcObject = stream;
        }

        videoElement.muted = isDeafened || controls.isMuted;
        videoElement.volume = isDeafened ? 0 : controls.volume;
        videoElement.play().catch(() => {});
      }
    });
  }, [remoteStreams, remoteMediaControls, isDeafened]);

  useEffect(() => {
    if (!focusedMediaUserId || !focusedVideoRef.current) return;

    const stream = remoteStreams[focusedMediaUserId];
    const controls = remoteMediaControls[focusedMediaUserId];
    if (!stream) return;

    focusedVideoRef.current.srcObject = stream;
    focusedVideoRef.current.muted = isDeafened || controls.isMuted;
    focusedVideoRef.current.volume = isDeafened ? 0 : controls.volume;
    focusedVideoRef.current.play().catch(() => {});
  }, [focusedMediaUserId, remoteStreams, remoteMediaControls, isDeafened]);

  useEffect(() => {
    const audioTrack = audioTrackRef.current;
    if (!audioTrack) return;

    const shouldTransmit = !isMuted && (!pushToTalkEnabled || isPTTPressed);
    audioTrack.enabled = shouldTransmit;
  }, [isMuted, pushToTalkEnabled, isPTTPressed]);

  useEffect(() => {
    if (!isInCall || !pushToTalkEnabled) return;

    const handleKeyDown = (event) => {
      const targetTag = event.target?.tagName;
      const isTypingTarget = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || event.target?.isContentEditable;
      if (isTypingTarget) return;

      if (event.code === 'Space') {
        event.preventDefault();
        setIsPTTPressed(true);
      }

      if (event.key.toLowerCase() === 'm') {
        setIsMuted((prev) => !prev);
      }

      if (event.key.toLowerCase() === 'd') {
        setIsDeafened((prev) => !prev);
      }
    };

    const handleKeyUp = (event) => {
      if (event.code === 'Space') {
        setIsPTTPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isInCall, pushToTalkEnabled]);

  useEffect(() => {
    if (!isInCall) {
      setPeerQuality({});
      return;
    }

    const qualityInterval = setInterval(async () => {
      const roomConnections = Array.from(peerConnectionsRef.current.entries())
        .filter(([key]) => key.startsWith(`${roomName}:`));

      for (const [key, peerConnection] of roomConnections) {
        const userId = key.replace(`${roomName}:`, '');
        try {
          const stats = await peerConnection.getStats();
          let rtt = null;
          let packetLossRatio = 0;

          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
              rtt = report.currentRoundTripTime * 1000;
            }

            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              const lost = report.packetsLost || 0;
              const received = report.packetsReceived || 0;
              const total = lost + received;
              if (total > 0) {
                packetLossRatio = lost / total;
              }
            }
          });

          let quality = 'Good';
          if ((rtt && rtt > 250) || packetLossRatio > 0.08) {
            quality = 'Poor';
          } else if ((rtt && rtt > 130) || packetLossRatio > 0.03) {
            quality = 'Fair';
          }

          setPeerQuality((prev) => ({ ...prev, [userId]: quality }));
        } catch (error) {
          setPeerQuality((prev) => ({ ...prev, [userId]: 'Unknown' }));
        }
      }
    }, 4000);

    return () => clearInterval(qualityInterval);
  }, [isInCall, roomName]);

  const getRoomPeerConnections = () => {
    return Array.from(peerConnectionsRef.current.entries())
      .filter(([key]) => key.startsWith(`${roomName}:`))
      .map(([, pc]) => pc);
  };

  const replaceVideoTrackForPeers = async (nextTrack) => {
    const peerConnections = getRoomPeerConnections();
    await Promise.all(
      peerConnections.map(async (peerConnection) => {
        const videoSender = peerConnection.getSenders().find((sender) => sender.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(nextTrack || null);
        }
      })
    );
  };

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
  const joinCall = async () => {
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true
        });
      } catch (cameraError) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        showNotice('Joined voice call. Camera permission is off.', 'info');
      }

      const audioTrack = stream.getAudioTracks()[0] || null;
      const cameraTrack = stream.getVideoTracks()[0] || null;

      if (audioTrack) {
        audioTrack.enabled = true;
      }

      if (cameraTrack) {
        cameraTrack.enabled = false;
      }

      localStreamRef.current = stream;
      audioTrackRef.current = audioTrack;
      cameraTrackRef.current = cameraTrack;
      screenTrackRef.current = null;

      if (localCameraVideoRef.current) {
        localCameraVideoRef.current.srcObject = null;
      }
      if (localScreenVideoRef.current) {
        localScreenVideoRef.current.srcObject = null;
      }

      setIsInCall(true);
      setIsMuted(false);
      setIsDeafened(false);
      setIsCameraOn(false);
      setIsScreenSharing(false);

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

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    audioTrackRef.current = null;
    cameraTrackRef.current = null;

    if (localCameraVideoRef.current) {
      localCameraVideoRef.current.srcObject = null;
    }
    if (localScreenVideoRef.current) {
      localScreenVideoRef.current.srcObject = null;
    }

    setRemoteStreams({});
    setRemoteMediaControls({});
    setFocusedMediaUserId(null);
    setPeerQuality({});

    setIsInCall(false);
    setIsMuted(false);
    setIsDeafened(false);
    setIsCameraOn(false);
    setIsScreenSharing(false);
    setPushToTalkEnabled(false);
    setIsPTTPressed(false);

    // Notify server
    if (notifyServer && !isDM) {
      socket.emit('leave_call', { roomName });
    }
  };

  const updateRemoteMediaControls = (userId, updater) => {
    setRemoteMediaControls((prev) => {
      const current = prev[userId] || {
        isVisible: true,
        volume: 1,
        isMuted: false,
        zoom: 1
      };

      const nextValue = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
      return {
        ...prev,
        [userId]: nextValue
      };
    });
  };

  const toggleRemoteVisibility = (userId) => {
    updateRemoteMediaControls(userId, (current) => ({
      ...current,
      isVisible: !current.isVisible
    }));
  };

  const setRemoteVolume = (userId, volumeValue) => {
    updateRemoteMediaControls(userId, (current) => ({
      ...current,
      volume: volumeValue
    }));
  };

  const toggleRemoteMute = (userId) => {
    updateRemoteMediaControls(userId, (current) => ({
      ...current,
      isMuted: !current.isMuted
    }));
  };

  const setRemoteZoom = (userId, zoomValue) => {
    updateRemoteMediaControls(userId, (current) => ({
      ...current,
      zoom: zoomValue
    }));
  };

  const toggleMute = () => {
    const audioTrack = audioTrackRef.current;
    if (!audioTrack) return;

    const nextMuted = !isMuted;
    audioTrack.enabled = !nextMuted;
    setIsMuted(nextMuted);
  };

  const testPreflight = async (type) => {
    try {
      if (type === 'mic') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((track) => track.stop());
      }

      if (type === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        stream.getTracks().forEach((track) => track.stop());
      }

      if (type === 'screen') {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error('Not supported');
        }
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        stream.getTracks().forEach((track) => track.stop());
      }

      setPreflightChecks((prev) => ({ ...prev, [type]: 'ok' }));
    } catch (error) {
      setPreflightChecks((prev) => ({ ...prev, [type]: 'blocked' }));
    }
  };

  const toggleDeafen = () => {
    setIsDeafened((prev) => !prev);
  };

  const toggleCamera = async () => {
    const cameraTrack = cameraTrackRef.current;
    if (!cameraTrack) {
      showNotice('Camera not available. Check browser camera permissions.', 'error');
      return;
    }

    const nextCameraOn = !isCameraOn;

    cameraTrack.enabled = nextCameraOn;
    setIsCameraOn(nextCameraOn);

    if (localCameraVideoRef.current && nextCameraOn) {
      localCameraVideoRef.current.srcObject = localStreamRef.current;
      localCameraVideoRef.current.play().catch(() => {});
    }
  };

  const stopScreenShare = async () => {
    if (!screenTrackRef.current) return;

    const currentScreenTrack = screenTrackRef.current;
    currentScreenTrack.onended = null;
    currentScreenTrack.stop();
    screenTrackRef.current = null;

    const fallbackTrack = cameraTrackRef.current || null;
    if (fallbackTrack) {
      fallbackTrack.enabled = isCameraOn;
    }

    await replaceVideoTrackForPeers(fallbackTrack);

    if (localScreenVideoRef.current) {
      localScreenVideoRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      showNotice('Screen sharing is not supported in this browser.', 'error');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) {
        showNotice('No display source selected.', 'error');
        return;
      }

      screenTrackRef.current = screenTrack;
      screenTrack.onended = () => {
        stopScreenShare();
      };

      await replaceVideoTrackForPeers(screenTrack);

      if (localScreenVideoRef.current) {
        localScreenVideoRef.current.srcObject = new MediaStream([screenTrack]);
        localScreenVideoRef.current.play().catch(() => {});
      }

      setIsScreenSharing(true);
      showNotice('Screen sharing started.', 'success');
    } catch (error) {
      showNotice('Could not start screen sharing.', 'error');
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

    setRemoteMediaControls((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });

    if (focusedMediaUserId === userId) {
      setFocusedMediaUserId(null);
    }
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

      setRemoteMediaControls((prev) => {
        if (prev[userId]) return prev;
        return {
          ...prev,
          [userId]: {
            isVisible: true,
            volume: 1,
            isMuted: false,
            zoom: 1
          }
        };
      });
    };

    peerConnection.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(peerConnection.connectionState)) {
        peerConnectionsRef.current.delete(connectionKey);
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        setRemoteMediaControls((prev) => {
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

  const getUserDisplayName = (userId) => {
    const roomUser = roomUsers.find((member) => String(member.userId) === String(userId));
    if (!roomUser) {
      return `User ${String(userId).slice(0, 6)}`;
    }

    const isOwner = roomMeta?.ownerId && String(roomMeta.ownerId) === String(roomUser.userId);
    return isOwner ? `${roomUser.username} (owner)` : roomUser.username;
  };

  const amIMutedInRoom = !isDM && Array.isArray(roomMeta?.mutedUserIds) && roomMeta.mutedUserIds.includes(currentUser.id);

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

    const text = String(msg.message || '');
    const mentionRegex = new RegExp(`(@${escapeRegex(String(currentUser.username))})`, 'ig');
    const mentionMatcher = new RegExp(`^@${escapeRegex(String(currentUser.username))}$`, 'i');
    const parts = text.split(mentionRegex);

    return (
      <div className="message-text">
        {parts.map((part, index) => (
          mentionMatcher.test(part)
            ? <span key={`${part}-${index}`} className="mention-highlight">{part}</span>
            : <span key={`${part}-${index}`}>{part}</span>
        ))}
      </div>
    );
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
                {amIMutedInRoom && ' • You are muted by owner'}
              </small>
            </>
          )}
        </div>
        {!isDM && (
          <div className="call-controls">
            {isInCall ? (
              <>
                <button
                  className={`call-action-btn ${pushToTalkEnabled ? 'active' : ''}`}
                  onClick={() => setPushToTalkEnabled((prev) => !prev)}
                >
                  {pushToTalkEnabled ? 'PTT On' : 'PTT Off'}
                </button>
                <button
                  className={`call-action-btn ${isMuted ? 'active' : ''}`}
                  onClick={toggleMute}
                >
                  {isMuted ? '🎙️ Unmute' : '🔇 Mute'}
                </button>
                <button
                  className={`call-action-btn ${isDeafened ? 'active' : ''}`}
                  onClick={toggleDeafen}
                >
                  {isDeafened ? '🔊 Undeafen' : '🙉 Deafen'}
                </button>
                <button
                  className={`call-action-btn ${isCameraOn ? 'active' : ''}`}
                  onClick={toggleCamera}
                >
                  {isCameraOn ? '📷 Camera Off' : '📷 Camera On'}
                </button>
                <button
                  className={`call-action-btn ${isScreenSharing ? 'active' : ''}`}
                  onClick={toggleScreenShare}
                >
                  {isScreenSharing ? '🖥️ Stop Share' : '🖥️ Share Screen'}
                </button>
                <button
                  className="voice-call-btn calling"
                  onClick={() => leaveCall(true)}
                >
                  📞 Leave Call
                </button>
              </>
            ) : (
              <button
                className="voice-call-btn"
                onClick={() => setShowPreflight(true)}
              >
                📞 Join Call
              </button>
            )}
          </div>
        )}
      </div>

      {!isDM && isInCall && (
        <div className="video-grid">
          {isCameraOn && (
            <div className="video-tile">
              <video ref={localCameraVideoRef} autoPlay muted playsInline className="remote-video" />
              <span className="video-label">You (Camera)</span>
            </div>
          )}
          {isScreenSharing && (
            <div className="video-tile">
              <video ref={localScreenVideoRef} autoPlay muted playsInline className="remote-video" />
              <span className="video-label">You (Sharing)</span>
            </div>
          )}
          {Object.entries(remoteStreams).map(([userId, stream]) => {
            const controls = remoteMediaControls[userId] || {
                isVisible: true,
              volume: 1,
              isMuted: false,
              zoom: 1
            };

            return (
            <div key={userId} className="video-tile">
                <div className="remote-video-wrap">
                  {controls.isVisible ? (
                    <video
                      autoPlay
                      playsInline
                      className="remote-video"
                      style={{ transform: `scale(${controls.zoom})`, transformOrigin: 'center center' }}
                      ref={(element) => {
                        remoteVideoRefs.current[userId] = element;
                        if (element) {
                          element.srcObject = stream;
                          element.muted = isDeafened || controls.isMuted;
                          element.volume = isDeafened ? 0 : controls.volume;
                          element.play().catch(() => {});
                        }
                      }}
                    />
                  ) : (
                <div className="media-preview-placeholder">
                    <div className="media-preview-title">{getUserDisplayName(userId)} hidden</div>
                </div>
              )}
                </div>
                <div className="video-meta-row">
                  <span className="video-chip">{getUserDisplayName(userId)}</span>
                  {peerQuality[userId] && (
                    <span className="video-quality-chip">{peerQuality[userId]}</span>
                  )}
                </div>
                <div className="remote-media-controls">
                  <button type="button" className="call-action-btn" onClick={() => toggleRemoteVisibility(userId)}>
                    {controls.isVisible ? 'Hide' : 'Show'}
                  </button>
                  <button type="button" className={`call-action-btn ${controls.isMuted ? 'active' : ''}`} onClick={() => toggleRemoteMute(userId)}>
                    {controls.isMuted ? 'Unmute User' : 'Mute User'}
                  </button>
                  <label className="remote-slider-label">
                    Vol
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={controls.volume}
                      onChange={(event) => setRemoteVolume(userId, Number(event.target.value))}
                    />
                  </label>
                  <label className="remote-slider-label">
                    Zoom
                    <input
                      type="range"
                      min="1"
                      max="2.5"
                      step="0.1"
                      value={controls.zoom}
                      onChange={(event) => setRemoteZoom(userId, Number(event.target.value))}
                    />
                  </label>
                  <button type="button" className="call-action-btn" onClick={() => setFocusedMediaUserId(userId)}>
                    Focus
                  </button>
                </div>
            </div>
          );})}
        </div>
      )}

      {isInCall && pushToTalkEnabled && (
        <div className="ptt-container">
          <button
            type="button"
            className={`ptt-button ${isPTTPressed ? 'active' : ''}`}
            onMouseDown={() => setIsPTTPressed(true)}
            onMouseUp={() => setIsPTTPressed(false)}
            onMouseLeave={() => setIsPTTPressed(false)}
            onTouchStart={() => setIsPTTPressed(true)}
            onTouchEnd={() => setIsPTTPressed(false)}
          >
            Hold to Talk (Space)
          </button>
        </div>
      )}

      {showPreflight && (
        <div className="focused-media-overlay" onClick={() => setShowPreflight(false)}>
          <div className="focused-media-content" onClick={(event) => event.stopPropagation()}>
            <div className="focused-media-header">
              <strong>Call Setup Check</strong>
              <button type="button" className="call-action-btn" onClick={() => setShowPreflight(false)}>Close</button>
            </div>
            <div style={{ padding: '16px' }}>
              <p style={{ marginBottom: '10px' }}>Test your permissions before joining:</p>
              <div className="call-controls" style={{ marginBottom: '12px' }}>
                <button className="call-action-btn" onClick={() => testPreflight('mic')}>Test Mic ({preflightChecks.mic})</button>
                <button className="call-action-btn" onClick={() => testPreflight('camera')}>Test Camera ({preflightChecks.camera})</button>
                <button className="call-action-btn" onClick={() => testPreflight('screen')}>Test Screen ({preflightChecks.screen})</button>
              </div>
              <button
                className="voice-call-btn"
                onClick={async () => {
                  await joinCall();
                  setShowPreflight(false);
                }}
              >
                Start Voice Call
              </button>
            </div>
          </div>
        </div>
      )}

      {focusedMediaUserId && remoteStreams[focusedMediaUserId] && (
        <div className="focused-media-overlay" onClick={() => setFocusedMediaUserId(null)}>
          <div className="focused-media-content" onClick={(event) => event.stopPropagation()}>
            <div className="focused-media-header">
              <strong>{getUserDisplayName(focusedMediaUserId)}</strong>
              <button type="button" className="call-action-btn" onClick={() => setFocusedMediaUserId(null)}>Close</button>
            </div>
            <video ref={focusedVideoRef} className="focused-media-video" autoPlay playsInline />
          </div>
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
