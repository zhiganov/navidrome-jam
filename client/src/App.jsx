import { useState, useEffect } from 'react';
import { useNavidrome } from './contexts/NavidromeContext';
import { useJam } from './contexts/JamContext';
import SyncedAudioPlayer from './components/SyncedAudioPlayer';
import './App.css';

function App() {
  // Get client instances from context
  const navidrome = useNavidrome();
  const jamClient = useJam();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomInput, setRoomInput] = useState('');
  const [roomError, setRoomError] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const restored = await navidrome.restoreSession();
        if (restored) {
          setIsAuthenticated(true);
          setUsername(navidrome.username);
          connectToJamServer();
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
        // Session restore failed, user will need to login
      }
    };

    restoreSession();
  }, []);

  // Setup Jam client event listeners
  useEffect(() => {
    // Define handler functions so we can properly clean them up
    const handleRoomState = (room) => {
      setCurrentRoom(room);
      setIsHost(room.hostId === jamClient.userId);
      setQueue(room.queue || []);
      setIsJoiningRoom(false); // Room joined successfully
      setIsCreatingRoom(false); // Room created successfully

      if (room.playbackState.trackId) {
        loadTrack(room.playbackState.trackId);
      }
    };

    const handleUserJoined = ({ room }) => {
      setCurrentRoom(room);
    };

    const handleUserLeft = ({ room, newHost }) => {
      setCurrentRoom(room);
      if (newHost === jamClient.userId) {
        setIsHost(true);
        alert('You are now the host!');
      }
    };

    const handleQueueUpdated = (newQueue) => {
      setQueue(newQueue);
    };

    const handleError = (message) => {
      setRoomError(message);
    };

    const handleDisconnected = () => {
      setIsConnected(false);
      setCurrentRoom(null);
    };

    // Register event listeners
    jamClient.on('room-state', handleRoomState);
    jamClient.on('user-joined', handleUserJoined);
    jamClient.on('user-left', handleUserLeft);
    jamClient.on('queue-updated', handleQueueUpdated);
    jamClient.on('error', handleError);
    jamClient.on('disconnected', handleDisconnected);

    // Cleanup: remove all event listeners
    return () => {
      jamClient.off('room-state', handleRoomState);
      jamClient.off('user-joined', handleUserJoined);
      jamClient.off('user-left', handleUserLeft);
      jamClient.off('queue-updated', handleQueueUpdated);
      jamClient.off('error', handleError);
      jamClient.off('disconnected', handleDisconnected);
      jamClient.disconnect();
    };
  }, []);

  const connectToJamServer = async () => {
    try {
      await jamClient.connect();
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to connect to Jam server:', error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      await navidrome.authenticate(username, password);
      setIsAuthenticated(true);
      setPassword('');
      await connectToJamServer();
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    navidrome.logout();
    jamClient.disconnect();
    setIsAuthenticated(false);
    setIsConnected(false);
    setCurrentRoom(null);
    setUsername('');
  };

  const handleCreateRoom = async () => {
    setIsCreatingRoom(true);
    setRoomError('');

    try {
      const room = await jamClient.createRoom(null, username);
      setRoomInput(room.id);
      jamClient.joinRoom(room.id, username);
    } catch (error) {
      setRoomError(error.message);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = () => {
    if (!roomInput.trim()) {
      setRoomError('Please enter a room code');
      return;
    }

    setIsJoiningRoom(true);
    setRoomError('');

    try {
      jamClient.joinRoom(roomInput.toUpperCase(), username);
      // Note: isJoiningRoom will be reset when room-state event is received
    } catch (error) {
      setRoomError(error.message);
      setIsJoiningRoom(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);

    try {
      const results = await navidrome.search(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const loadTrack = async (songId) => {
    setIsLoadingTrack(true);

    try {
      const result = await navidrome.getSong(songId);
      const song = result.song;
      setCurrentTrack({
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        coverArt: song.coverArt ? navidrome.getCoverArtUrl(song.coverArt, 300) : null,
        streamUrl: navidrome.getStreamUrl(song.id)
      });
    } catch (error) {
      console.error('Error loading track:', error);
    } finally {
      setIsLoadingTrack(false);
    }
  };

  const handlePlayTrack = (song) => {
    if (!isHost) {
      alert('Only the host can control playback');
      return;
    }

    jamClient.play(song.id, 0);
    loadTrack(song.id);
  };

  const handleAddToQueue = (song) => {
    if (!isHost) {
      alert('Only the host can modify the queue');
      return;
    }

    const newQueue = [...queue, {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album
    }];

    jamClient.updateQueue(newQueue);
  };

  const handleTrackEnded = () => {
    // Only host can auto-play next track
    if (!isHost) return;

    // Check if there are items in the queue
    if (queue.length === 0) {
      console.log('Queue is empty, playback stopped');
      return;
    }

    // Get next track from queue
    const nextTrack = queue[0];
    const newQueue = queue.slice(1); // Remove first item

    console.log(`Auto-playing next track: ${nextTrack.title}`);

    // Update queue on server
    jamClient.updateQueue(newQueue);

    // Play the next track
    jamClient.play(nextTrack.id, 0);
    loadTrack(nextTrack.id);
  };

  const handleLeaveRoom = () => {
    // Clear current room state to return to room selection screen
    setCurrentRoom(null);
    setCurrentTrack(null);
    setQueue([]);
    setSearchResults(null);
    setIsHost(false);

    // Note: We don't need to explicitly disconnect - the server will detect
    // the disconnection when the user joins a new room or refreshes
    console.log('Left room');
  };

  const handlePlayPause = () => {
    if (!isHost) return;

    const audio = document.querySelector('audio');
    if (!audio) return;

    if (audio.paused) {
      jamClient.play(currentTrack.id, audio.currentTime);
    } else {
      jamClient.pause(audio.currentTime);
    }
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="app login-screen">
        <div className="login-container">
          <h1>🎵 Navidrome Jam</h1>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isLoggingIn}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoggingIn}
            />
            <button type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? 'Logging in...' : 'Login to Navidrome'}
            </button>
          </form>
          {loginError && <div className="error">{loginError}</div>}
          <div className="server-info">
            Server: {navidrome.baseUrl}
          </div>
        </div>
      </div>
    );
  }

  // Room selection screen
  if (!currentRoom) {
    return (
      <div className="app room-screen">
        <div className="room-container">
          <h1>🎵 Navidrome Jam</h1>
          <p>Welcome, {username}!</p>

          <div className="room-controls">
            <h2>Join or Create a Room</h2>
            <div className="room-input-group">
              <input
                type="text"
                placeholder="Room Code"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                maxLength={6}
                disabled={isJoiningRoom || isCreatingRoom}
              />
              <button
                onClick={handleJoinRoom}
                disabled={!isConnected || isJoiningRoom || isCreatingRoom}
              >
                {isJoiningRoom ? 'Joining...' : 'Join Room'}
              </button>
            </div>
            <button
              onClick={handleCreateRoom}
              disabled={!isConnected || isCreatingRoom || isJoiningRoom}
            >
              {isCreatingRoom ? 'Creating...' : 'Create New Room'}
            </button>
          </div>

          {roomError && <div className="error">{roomError}</div>}
          {!isConnected && <div className="warning">Connecting to Jam server...</div>}

          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>
    );
  }

  // Main jam session screen
  return (
    <div className="app jam-screen">
      <header>
        <h1>🎵 Navidrome Jam</h1>
        <div className="header-info">
          <span>Room: {currentRoom.id}</span>
          <span>{isHost ? '👑 Host' : '🎧 Listener'}</span>
          <span>{username}</span>
        </div>
        <button onClick={handleLeaveRoom} className="leave-room-btn">
          Leave Room
        </button>
      </header>

      <div className="main-content">
        {/* Left sidebar: Users */}
        <aside className="users-panel">
          <h3>In this room ({currentRoom.users?.length || 0})</h3>
          <ul className="users-list">
            {currentRoom.users?.map((user) => (
              <li key={user.id} className={user.id === currentRoom.hostId ? 'host' : ''}>
                <span>{user.username}</span>
                {user.id === currentRoom.hostId && <span className="badge">HOST</span>}
              </li>
            ))}
          </ul>
        </aside>

        {/* Center: Player and Search */}
        <main className="player-panel">
          {isLoadingTrack && !currentTrack && (
            <div className="loading-track">
              <p>Loading track...</p>
            </div>
          )}

          {currentTrack && (
            <div className="now-playing">
              {currentTrack.coverArt && (
                <img src={currentTrack.coverArt} alt="Album art" className="cover-art" />
              )}
              <div className="track-info">
                <h2>{currentTrack.title}</h2>
                <p>{currentTrack.artist}</p>
                <p className="album">{currentTrack.album}</p>
              </div>
            </div>
          )}

          {currentTrack && (
            <SyncedAudioPlayer
              streamUrl={currentTrack.streamUrl}
              jamClient={jamClient}
              isHost={isHost}
              isConnected={isConnected}
              onEnded={handleTrackEnded}
            />
          )}

          {isHost && (
            <div className="host-controls">
              <button onClick={handlePlayPause}>
                {currentTrack ? 'Play/Pause' : 'No track loaded'}
              </button>
            </div>
          )}

          <div className="search-panel">
            <h3>Search Music</h3>
            <form onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="Search songs, albums, artists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isSearching}
              />
              <button type="submit" disabled={isSearching}>
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </form>

            {searchResults && (
              <div className="search-results">
                {searchResults.searchResult3?.song?.length > 0 && (
                  <div className="results-section">
                    <h4>Songs</h4>
                    <ul>
                      {searchResults.searchResult3.song.map((song) => (
                        <li key={song.id} className="song-item">
                          <div className="song-info">
                            <strong>{song.title}</strong>
                            <span>{song.artist}</span>
                          </div>
                          <div className="song-actions">
                            {isHost && (
                              <>
                                <button onClick={() => handlePlayTrack(song)}>Play</button>
                                <button onClick={() => handleAddToQueue(song)}>Add to Queue</button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Right sidebar: Queue */}
        <aside className="queue-panel">
          <h3>Queue ({queue.length})</h3>
          <ul className="queue-list">
            {queue.map((track, index) => (
              <li key={index}>
                <div className="queue-track">
                  <strong>{track.title}</strong>
                  <span>{track.artist}</span>
                </div>
              </li>
            ))}
            {queue.length === 0 && <li className="empty">Queue is empty</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default App;
