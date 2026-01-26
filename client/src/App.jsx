import { useState, useEffect } from 'react';
import NavidromeClient from './services/navidrome';
import JamClient from './services/jamClient';
import SyncedAudioPlayer from './components/SyncedAudioPlayer';
import './App.css';

const navidromeUrl = import.meta.env.VITE_NAVIDROME_URL || 'http://localhost:4533';
const jamServerUrl = import.meta.env.VITE_JAM_SERVER_URL || 'http://localhost:3001';

const navidrome = new NavidromeClient(navidromeUrl);
const jamClient = new JamClient(jamServerUrl);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomInput, setRoomInput] = useState('');
  const [roomError, setRoomError] = useState('');

  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isHost, setIsHost] = useState(false);

  // Restore session on mount
  useEffect(() => {
    if (navidrome.restoreSession()) {
      setIsAuthenticated(true);
      setUsername(navidrome.username);
      connectToJamServer();
    }
  }, []);

  // Setup Jam client event listeners
  useEffect(() => {
    jamClient.on('room-state', (room) => {
      setCurrentRoom(room);
      setIsHost(room.hostId === jamClient.userId);
      setQueue(room.queue || []);

      if (room.playbackState.trackId) {
        loadTrack(room.playbackState.trackId);
      }
    });

    jamClient.on('user-joined', ({ room }) => {
      setCurrentRoom(room);
    });

    jamClient.on('user-left', ({ room, newHost }) => {
      setCurrentRoom(room);
      if (newHost === jamClient.userId) {
        setIsHost(true);
        alert('You are now the host!');
      }
    });

    jamClient.on('queue-updated', (newQueue) => {
      setQueue(newQueue);
    });

    jamClient.on('error', (message) => {
      setRoomError(message);
    });

    jamClient.on('disconnected', () => {
      setIsConnected(false);
      setCurrentRoom(null);
    });

    return () => {
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

    try {
      await navidrome.authenticate(username, password);
      setIsAuthenticated(true);
      setPassword('');
      await connectToJamServer();
    } catch (error) {
      setLoginError(error.message);
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
    try {
      const room = await jamClient.createRoom(null, username);
      setRoomInput(room.id);
      jamClient.joinRoom(room.id, username);
    } catch (error) {
      setRoomError(error.message);
    }
  };

  const handleJoinRoom = () => {
    if (!roomInput.trim()) {
      setRoomError('Please enter a room code');
      return;
    }

    try {
      jamClient.joinRoom(roomInput.toUpperCase(), username);
      setRoomError('');
    } catch (error) {
      setRoomError(error.message);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const results = await navidrome.search(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const loadTrack = async (songId) => {
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
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">Login to Navidrome</button>
          </form>
          {loginError && <div className="error">{loginError}</div>}
          <div className="server-info">
            Server: {navidromeUrl}
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
              />
              <button onClick={handleJoinRoom} disabled={!isConnected}>
                Join Room
              </button>
            </div>
            <button onClick={handleCreateRoom} disabled={!isConnected}>
              Create New Room
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
              />
              <button type="submit">Search</button>
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
