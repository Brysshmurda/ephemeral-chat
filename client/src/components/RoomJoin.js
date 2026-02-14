import React, { useState } from 'react';

const RoomJoin = ({ onJoinRoom }) => {
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const trimmedRoomName = roomName.trim();
    
    if (!trimmedRoomName) {
      setError('Room name cannot be empty');
      return;
    }

    if (trimmedRoomName.length < 3) {
      setError('Room name must be at least 3 characters');
      return;
    }

    if (trimmedRoomName.length > 30) {
      setError('Room name must be less than 30 characters');
      return;
    }

    // Only allow alphanumeric, spaces, hyphens, and underscores
    if (!/^[a-zA-Z0-9 _-]+$/.test(trimmedRoomName)) {
      setError('Room name can only contain letters, numbers, spaces, hyphens, and underscores');
      return;
    }

    onJoinRoom(trimmedRoomName);
  };

  return (
    <div className="room-join-container">
      <div className="room-join-card">
        <h2>🏠 Join a Chat Room</h2>
        <p className="room-join-description">
          Create a new room or join an existing one by entering the same room name
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Room Name</label>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Enter room name (e.g., 'Friends Chat')"
              className="room-input"
              autoFocus
            />
            <small>3-30 characters, letters, numbers, spaces, hyphens, underscores</small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="join-room-btn">
            Join Room
          </button>
        </form>

        <div className="room-info-box">
          <h4>💡 How it works:</h4>
          <ul>
            <li>Enter a room name to create or join</li>
            <li>Share the room name with friends</li>
            <li>Everyone with the same room name can chat together</li>
            <li>Rooms disappear when everyone leaves</li>
            <li>All messages are ephemeral - no history saved</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default RoomJoin;
