import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavidrome } from './contexts/NavidromeContext';
import { useJam } from './contexts/JamContext';
import SyncedAudioPlayer from './components/SyncedAudioPlayer';
import './App.css';

function App() {
  // Get client instances from context
  const navidrome = useNavidrome();
  const jamClient = useJam();
  const audioRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [inviteCode, setInviteCode] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState('');

  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomInput, setRoomInput] = useState('');
  const [roomError, setRoomError] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [activeRooms, setActiveRooms] = useState([]);

  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [canControl, setCanControl] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);

  // Play history for previous track
  const [playHistory, setPlayHistory] = useState([]);

  // Browse state
  const [musicTab, setMusicTab] = useState('browse');
  const [browseView, setBrowseView] = useState('artists');
  const [artists, setArtists] = useState(null);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(false);

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
      }
    };

    restoreSession();
  }, []);

  // Setup Jam client event listeners
  useEffect(() => {
    const handleRoomState = (room) => {
      setCurrentRoom(room);
      const host = room.hostId === jamClient.userId;
      const cohost = (room.coHosts || []).includes(jamClient.userId);
      setIsHost(host);
      setCanControl(host || cohost);
      setQueue(room.queue || []);
      setIsJoiningRoom(false);
      setIsCreatingRoom(false);

      if (room.playbackState.trackId) {
        loadTrack(room.playbackState.trackId);
      }
    };

    const handleUserJoined = ({ room }) => {
      setCurrentRoom(room);
    };

    const handleUserLeft = ({ room, newHost }) => {
      setCurrentRoom(room);
      const cohost = (room.coHosts || []).includes(jamClient.userId);
      setCanControl(room.hostId === jamClient.userId || cohost);
      if (newHost === jamClient.userId) {
        setIsHost(true);
        setCanControl(true);
        alert('You are now the host!');
      }
    };

    const handleCoHostUpdated = (room) => {
      setCurrentRoom(room);
      const host = room.hostId === jamClient.userId;
      const cohost = (room.coHosts || []).includes(jamClient.userId);
      setIsHost(host);
      setCanControl(host || cohost);
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

    jamClient.on('room-state', handleRoomState);
    jamClient.on('user-joined', handleUserJoined);
    jamClient.on('user-left', handleUserLeft);
    jamClient.on('cohost-updated', handleCoHostUpdated);
    jamClient.on('queue-updated', handleQueueUpdated);
    jamClient.on('error', handleError);
    jamClient.on('disconnected', handleDisconnected);

    return () => {
      jamClient.off('room-state', handleRoomState);
      jamClient.off('user-joined', handleUserJoined);
      jamClient.off('user-left', handleUserLeft);
      jamClient.off('cohost-updated', handleCoHostUpdated);
      jamClient.off('queue-updated', handleQueueUpdated);
      jamClient.off('error', handleError);
      jamClient.off('disconnected', handleDisconnected);
      jamClient.disconnect();
    };
  }, []);

  const fetchActiveRooms = useCallback(async () => {
    try {
      const rooms = await jamClient.listRooms();
      setActiveRooms(rooms);
    } catch (e) {
      // silent — room list is best-effort
    }
  }, [jamClient]);

  // Poll active rooms every 10s when on room selection screen
  useEffect(() => {
    if (!isAuthenticated || currentRoom) return;
    fetchActiveRooms();
    const interval = setInterval(fetchActiveRooms, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, currentRoom, fetchActiveRooms]);

  const connectToJamServer = async () => {
    try {
      await jamClient.connect();
      setIsConnected(true);
      fetchActiveRooms();
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

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoginError('');
    setRegisterSuccess('');
    setIsRegistering(true);

    try {
      const result = await jamClient.register(username, password, inviteCode);
      setRegisterSuccess(result.message);
      setInviteCode('');
      setAuthMode('login');
      setPassword('');
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setIsRegistering(false);
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

  // Browse handlers
  const loadArtists = async () => {
    if (artists) return; // Already loaded
    setIsLoadingBrowse(true);
    try {
      const result = await navidrome.getArtists();
      // Flatten the indexed artist list
      const allArtists = [];
      if (result.artists?.index) {
        for (const idx of result.artists.index) {
          if (idx.artist) {
            const artistList = Array.isArray(idx.artist) ? idx.artist : [idx.artist];
            allArtists.push(...artistList);
          }
        }
      }
      setArtists(allArtists);
    } catch (error) {
      console.error('Error loading artists:', error);
    } finally {
      setIsLoadingBrowse(false);
    }
  };

  const handleBrowseArtist = async (artist) => {
    setIsLoadingBrowse(true);
    try {
      const result = await navidrome.getArtist(artist.id);
      const albums = result.artist?.album
        ? (Array.isArray(result.artist.album) ? result.artist.album : [result.artist.album])
        : [];
      setSelectedArtist({ ...artist, albums });
      setBrowseView('albums');
    } catch (error) {
      console.error('Error loading artist:', error);
    } finally {
      setIsLoadingBrowse(false);
    }
  };

  const handleBrowseAlbum = async (album) => {
    setIsLoadingBrowse(true);
    try {
      const result = await navidrome.getAlbum(album.id);
      const songs = result.album?.song
        ? (Array.isArray(result.album.song) ? result.album.song : [result.album.song])
        : [];
      setSelectedAlbum({ ...album, songs });
      setBrowseView('songs');
    } catch (error) {
      console.error('Error loading album:', error);
    } finally {
      setIsLoadingBrowse(false);
    }
  };

  const handleBrowseBack = () => {
    if (browseView === 'songs') {
      setSelectedAlbum(null);
      setBrowseView('albums');
    } else if (browseView === 'albums') {
      setSelectedArtist(null);
      setBrowseView('artists');
    }
  };

  // Load artists when switching to browse tab
  useEffect(() => {
    if (musicTab === 'browse' && currentRoom) {
      loadArtists();
    }
  }, [musicTab, currentRoom]);

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

  const handlePlayTrack = (song, albumSongs = null) => {
    if (!canControl) {
      alert('Only the host or co-hosts can control playback');
      return;
    }

    // Push current track to history before switching
    if (currentTrack) {
      setPlayHistory(prev => [...prev, { id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album }]);
    }

    // If playing from an album, queue the remaining tracks after this one
    if (albumSongs) {
      const songIndex = albumSongs.findIndex(s => s.id === song.id);
      const remaining = albumSongs.slice(songIndex + 1).map(s => ({
        id: s.id, title: s.title, artist: s.artist, album: s.album
      }));
      jamClient.updateQueue(remaining);
    }

    jamClient.play(song.id, 0);
    loadTrack(song.id);
  };

  const handleAddToQueue = (song) => {
    if (!canControl) {
      alert('Only the host or co-hosts can modify the queue');
      return;
    }

    const item = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album
    };

    // If nothing is playing, auto-play immediately
    if (!currentTrack) {
      jamClient.updateQueue(queue);
      jamClient.play(song.id, 0);
      loadTrack(song.id);
      return;
    }

    const newQueue = [...queue, item];
    jamClient.updateQueue(newQueue);
  };

  const handleTrackEnded = useCallback(() => {
    if (!canControl) return;

    if (queue.length === 0) {
      console.log('Queue is empty, playback stopped');
      return;
    }

    // Push current track to history
    if (currentTrack) {
      setPlayHistory(prev => [...prev, { id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album }]);
    }

    const nextTrack = queue[0];
    const newQueue = queue.slice(1);

    console.log(`Auto-playing next track: ${nextTrack.title}`);

    jamClient.updateQueue(newQueue);
    jamClient.play(nextTrack.id, 0);
    loadTrack(nextTrack.id);
  }, [canControl, queue, jamClient, currentTrack]);

  const handleLeaveRoom = () => {
    jamClient.leaveRoom();

    setCurrentRoom(null);
    setCurrentTrack(null);
    setQueue([]);
    setPlayHistory([]);
    setSearchResults(null);
    setIsHost(false);
    setCanControl(false);
    setIsPlaying(false);

    console.log('Left room');
  };

  const handlePlayPause = () => {
    if (!canControl) return;

    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      jamClient.play(currentTrack.id, audio.currentTime);
    } else {
      jamClient.pause(audio.currentTime);
    }
  };

  const handleNextTrack = useCallback(() => {
    if (!canControl || queue.length === 0) return;

    // Push current track to history
    if (currentTrack) {
      setPlayHistory(prev => [...prev, { id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album }]);
    }

    const nextTrack = queue[0];
    const newQueue = queue.slice(1);

    jamClient.updateQueue(newQueue);
    jamClient.play(nextTrack.id, 0);
    loadTrack(nextTrack.id);
  }, [canControl, queue, jamClient, currentTrack]);

  const handlePrevTrack = useCallback(() => {
    if (!canControl || !currentTrack) return;

    const audio = audioRef.current;

    // If more than 3 seconds in, restart current track
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      jamClient.play(currentTrack.id, 0);
      return;
    }

    // Otherwise go to previous track from history
    if (playHistory.length === 0) {
      // No history — just restart
      if (audio) {
        audio.currentTime = 0;
        jamClient.play(currentTrack.id, 0);
      }
      return;
    }

    // Pop last track from history, put current track back at front of queue
    const prevTrack = playHistory[playHistory.length - 1];
    setPlayHistory(prev => prev.slice(0, -1));

    const newQueue = [{ id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album }, ...queue];
    jamClient.updateQueue(newQueue);

    jamClient.play(prevTrack.id, 0);
    loadTrack(prevTrack.id);
  }, [canControl, currentTrack, jamClient, playHistory, queue]);

  const handlePlaybackUpdate = useCallback((time, paused) => {
    setIsPlaying(!paused);
  }, []);

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="app login-screen">
        <div className="login-container win98-window">
          <div className="win98-titlebar">
            <span className="win98-titlebar-text">Navidrome Jam - Welcome</span>
            <div className="win98-titlebar-buttons">
              <button className="win98-titlebar-btn">_</button>
              <button className="win98-titlebar-btn">X</button>
            </div>
          </div>
          <div className="win98-body">
            <h1>Navidrome Jam</h1>
            <div className="login-subtitle">~ The Music Lounge ~</div>

            <hr className="retro-divider" />

            {registerSuccess && <div className="success">{registerSuccess}</div>}

            <div className="auth-tabs">
              <button
                className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => { setAuthMode('login'); setLoginError(''); }}
              >
                Login
              </button>
              <button
                className={`auth-tab ${authMode === 'signup' ? 'active' : ''}`}
                onClick={() => { setAuthMode('signup'); setLoginError(''); }}
              >
                Sign Up
              </button>
            </div>

            <div className="auth-tab-content">
              {authMode === 'login' ? (
                <form onSubmit={handleLogin}>
                  <div className="form-row">
                    <label>User:</label>
                    <input
                      type="text"
                      className="win98-input"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      disabled={isLoggingIn}
                    />
                  </div>
                  <div className="form-row">
                    <label>Pass:</label>
                    <input
                      type="password"
                      className="win98-input"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoggingIn}
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="win98-btn" disabled={isLoggingIn}>
                      {isLoggingIn ? 'Logging in...' : 'OK'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleRegister}>
                  <div className="form-row">
                    <label>User:</label>
                    <input
                      type="text"
                      className="win98-input"
                      placeholder="Choose a username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      disabled={isRegistering}
                      minLength={3}
                      maxLength={50}
                    />
                  </div>
                  <div className="form-row">
                    <label>Pass:</label>
                    <input
                      type="password"
                      className="win98-input"
                      placeholder="Choose a password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isRegistering}
                      minLength={6}
                    />
                  </div>
                  <div className="form-row">
                    <label>Invite:</label>
                    <input
                      type="text"
                      className="win98-input"
                      placeholder="Invite code"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      required
                      disabled={isRegistering}
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="win98-btn" disabled={isRegistering}>
                      {isRegistering ? 'Creating...' : 'Register'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {loginError && <div className="error">{loginError}</div>}

            <div className="server-info">
              Server: {navidrome.baseUrl}
            </div>
          </div>
        </div>

        <div className="geocities-footer">
          <div className="under-construction">
            * * * Best viewed in Netscape Navigator 4.0 at 800x600 * * *
          </div>
          <div className="visitor-counter">
            <span className="counter-digit">0</span>
            <span className="counter-digit">0</span>
            <span className="counter-digit">4</span>
            <span className="counter-digit">2</span>
            <span className="counter-digit">0</span>
          </div>
          <a href="https://github.com/zhiganov/navidrome-jam" target="_blank" rel="noopener" className="github-badge">&#9733; Source Code on GitHub &#9733;</a>
        </div>
      </div>
    );
  }

  // Room selection screen
  if (!currentRoom) {
    return (
      <div className="app room-screen">
        <div className="room-container win98-window">
          <div className="win98-titlebar">
            <span className="win98-titlebar-text">Navidrome Jam - Room Select</span>
            <div className="win98-titlebar-buttons">
              <button className="win98-titlebar-btn">_</button>
              <button className="win98-titlebar-btn">X</button>
            </div>
          </div>
          <div className="win98-body">
            <h1>Navidrome Jam</h1>
            <p>Welcome, {username}!</p>

            <hr className="retro-divider" />

            <div className="room-controls">
              <fieldset className="win98-fieldset">
                <legend>Join or Create a Room</legend>
                <div className="room-input-group">
                  <input
                    type="text"
                    className="win98-input"
                    placeholder="ROOM CODE"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                    maxLength={6}
                    disabled={isJoiningRoom || isCreatingRoom}
                  />
                  <button
                    className="win98-btn"
                    onClick={handleJoinRoom}
                    disabled={!isConnected || isJoiningRoom || isCreatingRoom}
                  >
                    {isJoiningRoom ? 'Joining...' : 'Join'}
                  </button>
                </div>
                <button
                  className="win98-btn"
                  onClick={handleCreateRoom}
                  disabled={!isConnected || isCreatingRoom || isJoiningRoom}
                >
                  {isCreatingRoom ? 'Creating...' : 'Create New Room'}
                </button>
              </fieldset>
            </div>

            {roomError && <div className="error">{roomError}</div>}
            {!isConnected && <div className="warning">Connecting to Jam server...</div>}

            {activeRooms.length > 0 && (
              <>
                <hr className="retro-divider" />
                <fieldset className="win98-fieldset active-rooms-fieldset">
                  <legend>Active Rooms ({activeRooms.length})</legend>
                  <ul className="active-rooms-list">
                    {activeRooms.map(room => (
                      <li key={room.id} className="active-room-item">
                        <div className="active-room-info">
                          <span className="active-room-code">{room.id}</span>
                          <span className="active-room-meta">
                            {room.hostName} &middot; {room.userCount} {room.userCount === 1 ? 'listener' : 'listeners'}
                          </span>
                          {room.currentTrack && (
                            <span className="active-room-track">
                              {room.currentTrack.playing ? '\u266B ' : '\u23F8 '}
                              {room.currentTrack.title}{room.currentTrack.artist ? ` \u2013 ${room.currentTrack.artist}` : ''}
                            </span>
                          )}
                        </div>
                        <button
                          className="win98-btn active-room-join"
                          onClick={() => {
                            setRoomInput(room.id);
                            setIsJoiningRoom(true);
                            setRoomError('');
                            try { jamClient.joinRoom(room.id, username); } catch (e) { setRoomError(e.message); setIsJoiningRoom(false); }
                          }}
                          disabled={!isConnected || isJoiningRoom || isCreatingRoom}
                        >
                          Join
                        </button>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              </>
            )}

            <div className="form-actions">
              <button onClick={handleLogout} className="win98-btn logout-btn">
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="geocities-footer">
          <div className="marquee-container">
            <span className="marquee-text">
              ~*~ Welcome to the Navidrome Jam Music Lounge! Listen together with friends! ~*~
            </span>
          </div>
          <a href="https://github.com/zhiganov/navidrome-jam" target="_blank" rel="noopener" className="github-badge">&#9733; Source Code on GitHub &#9733;</a>
        </div>
      </div>
    );
  }

  // Main jam session screen
  return (
    <div className="app jam-screen">
      <header>
        <h1>Navidrome Jam</h1>
        <div className="header-info">
          <span>Room: {currentRoom.id}</span>
          <span>{isHost ? 'HOST' : canControl ? 'CO-HOST' : 'LISTENER'}</span>
          <span>{username}</span>
        </div>
        <button onClick={handleLeaveRoom} className="win98-btn leave-room-btn">
          Leave Room
        </button>
      </header>

      <div className="main-content">
        {/* Left sidebar: Users */}
        <aside className="users-panel">
          <div className="panel-titlebar">
            Users ({currentRoom.users?.length || 0})
          </div>
          <div className="panel-body">
            <ul className="users-list">
              {currentRoom.users?.map((user) => {
                const userIsHost = user.id === currentRoom.hostId;
                const userIsCoHost = (currentRoom.coHosts || []).includes(user.id);
                return (
                  <li key={user.id} className={userIsHost ? 'host' : userIsCoHost ? 'cohost' : ''}>
                    <span className="user-name">{user.username}</span>
                    <span className="user-badges">
                      {userIsHost && <span className="badge badge-host">HOST</span>}
                      {userIsCoHost && <span className="badge badge-cohost">CO-HOST</span>}
                      {isHost && !userIsHost && (
                        userIsCoHost ? (
                          <button
                            className="user-action-btn demote-btn"
                            onClick={() => jamClient.demoteCoHost(user.id)}
                            title="Remove co-host"
                          >
                            &minus;
                          </button>
                        ) : (
                          <button
                            className="user-action-btn promote-btn"
                            onClick={() => jamClient.promoteCoHost(user.id)}
                            title="Make co-host"
                          >
                            +
                          </button>
                        )
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Center: Player and Search */}
        <main className="player-panel">
          <div className="panel-titlebar">
            Now Playing
          </div>
          <div className="panel-body">
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
                isHost={canControl}
                isConnected={isConnected}
                onPlaybackUpdate={handlePlaybackUpdate}
                onEnded={handleTrackEnded}
                audioRef={audioRef}
              />
            )}

            {canControl && (
              <div className="transport-controls">
                <button
                  className="transport-btn"
                  onClick={handlePrevTrack}
                  disabled={!currentTrack}
                  title={playHistory.length > 0 ? "Previous track" : "Restart track"}
                >
                  <span className="transport-icon prev-icon"></span>
                </button>
                <button
                  className="transport-btn transport-play-btn"
                  onClick={handlePlayPause}
                  disabled={!currentTrack}
                >
                  {isPlaying
                    ? <span className="transport-icon pause-icon"></span>
                    : <span className="transport-icon play-icon"></span>
                  }
                </button>
                <button
                  className="transport-btn"
                  onClick={handleNextTrack}
                  disabled={!currentTrack || queue.length === 0}
                  title="Next track"
                >
                  <span className="transport-icon next-icon"></span>
                </button>
              </div>
            )}

            <hr className="retro-divider" />

            {/* Music tabs: Browse | Search */}
            <div className="music-tabs">
              <button
                className={`auth-tab ${musicTab === 'browse' ? 'active' : ''}`}
                onClick={() => setMusicTab('browse')}
              >
                Browse
              </button>
              <button
                className={`auth-tab ${musicTab === 'search' ? 'active' : ''}`}
                onClick={() => setMusicTab('search')}
              >
                Search
              </button>
            </div>

            <div className="music-tab-content">
              {musicTab === 'search' ? (
                <div className="search-panel">
                  <form onSubmit={handleSearch}>
                    <input
                      type="text"
                      className="win98-input"
                      placeholder="Search songs, albums, artists..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={isSearching}
                    />
                    <button type="submit" className="win98-btn" disabled={isSearching}>
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
                                  {canControl && (
                                    <>
                                      <button onClick={() => handlePlayTrack(song)}>Play</button>
                                      <button onClick={() => handleAddToQueue(song)}>Queue+</button>
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
              ) : (
                <div className="browse-panel">
                  {/* Breadcrumb navigation */}
                  <div className="browse-breadcrumb">
                    <span
                      className={browseView === 'artists' ? 'current' : 'clickable'}
                      onClick={() => { setBrowseView('artists'); setSelectedArtist(null); setSelectedAlbum(null); }}
                    >
                      Library
                    </span>
                    {selectedArtist && (
                      <>
                        <span className="separator">&gt;</span>
                        <span
                          className={browseView === 'albums' ? 'current' : 'clickable'}
                          onClick={() => { setBrowseView('albums'); setSelectedAlbum(null); }}
                        >
                          {selectedArtist.name}
                        </span>
                      </>
                    )}
                    {selectedAlbum && (
                      <>
                        <span className="separator">&gt;</span>
                        <span className="current">{selectedAlbum.name}</span>
                      </>
                    )}
                  </div>

                  {isLoadingBrowse && (
                    <div className="browse-loading">Loading...</div>
                  )}

                  {/* Artists list */}
                  {!isLoadingBrowse && browseView === 'artists' && (
                    <div className="browse-list">
                      {artists && artists.length > 0 ? (
                        <ul>
                          {artists.map((artist) => (
                            <li
                              key={artist.id}
                              className="browse-item"
                              onClick={() => handleBrowseArtist(artist)}
                            >
                              <span className="browse-icon folder-icon"></span>
                              <div className="browse-item-info">
                                <strong>{artist.name}</strong>
                                <span>{artist.albumCount} album{artist.albumCount !== 1 ? 's' : ''}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="browse-empty">No artists found</div>
                      )}
                    </div>
                  )}

                  {/* Albums list */}
                  {!isLoadingBrowse && browseView === 'albums' && selectedArtist && (
                    <div className="browse-list">
                      <button className="win98-btn browse-back-btn" onClick={handleBrowseBack}>
                        &lt; Back
                      </button>
                      {selectedArtist.albums.length > 0 ? (
                        <ul>
                          {selectedArtist.albums.map((album) => (
                            <li
                              key={album.id}
                              className="browse-item album-item"
                              onClick={() => handleBrowseAlbum(album)}
                            >
                              {album.coverArt ? (
                                <img
                                  src={navidrome.getCoverArtUrl(album.coverArt, 40)}
                                  alt=""
                                  className="browse-thumb"
                                />
                              ) : (
                                <span className="browse-icon cd-icon"></span>
                              )}
                              <div className="browse-item-info">
                                <strong>{album.name}</strong>
                                <span>{album.year ? `${album.year} - ` : ''}{album.songCount} track{album.songCount !== 1 ? 's' : ''}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="browse-empty">No albums found</div>
                      )}
                    </div>
                  )}

                  {/* Songs list */}
                  {!isLoadingBrowse && browseView === 'songs' && selectedAlbum && (
                    <div className="browse-list">
                      <button className="win98-btn browse-back-btn" onClick={handleBrowseBack}>
                        &lt; Back
                      </button>

                      {selectedAlbum.coverArt && (
                        <div className="browse-album-header">
                          <img
                            src={navidrome.getCoverArtUrl(selectedAlbum.coverArt, 80)}
                            alt=""
                            className="browse-album-art"
                          />
                          <div className="browse-album-meta">
                            <strong>{selectedAlbum.name}</strong>
                            <span>{selectedArtist?.name}</span>
                            {selectedAlbum.year && <span>{selectedAlbum.year}</span>}
                          </div>
                        </div>
                      )}

                      {selectedAlbum.songs.length > 0 ? (
                        <ul>
                          {selectedAlbum.songs.map((song, index) => (
                            <li key={song.id} className="song-item">
                              <div className="song-info">
                                <strong>
                                  <span className="track-num">{song.track || index + 1}.</span>
                                  {song.title}
                                </strong>
                                <span>{formatDuration(song.duration)}</span>
                              </div>
                              <div className="song-actions">
                                {canControl && (
                                  <>
                                    <button onClick={() => handlePlayTrack(song, selectedAlbum.songs)}>Play</button>
                                    <button onClick={() => handleAddToQueue(song)}>Queue+</button>
                                  </>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="browse-empty">No tracks found</div>
                      )}

                      {canControl && selectedAlbum.songs.length > 0 && (
                        <div className="browse-album-actions">
                          <button
                            className="win98-btn"
                            onClick={() => {
                              const newItems = selectedAlbum.songs.map(song => ({
                                id: song.id,
                                title: song.title,
                                artist: song.artist,
                                album: song.album
                              }));

                              if (!currentTrack && newItems.length > 0) {
                                // Nothing playing — start the first track, queue the rest
                                const [first, ...rest] = newItems;
                                jamClient.updateQueue([...queue, ...rest]);
                                jamClient.play(first.id, 0);
                                loadTrack(first.id);
                              } else {
                                jamClient.updateQueue([...queue, ...newItems]);
                              }
                            }}
                          >
                            Queue All
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right sidebar: Queue */}
        <aside className="queue-panel">
          <div className="panel-titlebar">
            Queue ({queue.length})
          </div>
          <div className="panel-body">
            <ul className="queue-list">
              {queue.map((track, index) => (
                <li key={`${track.id}-${index}`}>
                  <div className="queue-track">
                    <span className="queue-num">{index + 1}.</span>
                    <div className="queue-track-info">
                      <strong>{track.title}</strong>
                      <span>{track.artist}</span>
                    </div>
                  </div>
                  {canControl && (
                    <div className="queue-controls">
                      <button
                        className="queue-ctrl-btn"
                        onClick={() => {
                          if (index === 0) return;
                          const newQueue = [...queue];
                          [newQueue[index - 1], newQueue[index]] = [newQueue[index], newQueue[index - 1]];
                          jamClient.updateQueue(newQueue);
                        }}
                        disabled={index === 0}
                        title="Move up"
                      >
                        &#9650;
                      </button>
                      <button
                        className="queue-ctrl-btn"
                        onClick={() => {
                          if (index === queue.length - 1) return;
                          const newQueue = [...queue];
                          [newQueue[index], newQueue[index + 1]] = [newQueue[index + 1], newQueue[index]];
                          jamClient.updateQueue(newQueue);
                        }}
                        disabled={index === queue.length - 1}
                        title="Move down"
                      >
                        &#9660;
                      </button>
                      <button
                        className="queue-ctrl-btn queue-remove-btn"
                        onClick={() => {
                          const newQueue = queue.filter((_, i) => i !== index);
                          jamClient.updateQueue(newQueue);
                        }}
                        title="Remove"
                      >
                        &#10005;
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {queue.length === 0 && <li className="empty">Queue is empty</li>}
            </ul>
          </div>
        </aside>
      </div>

      <div className="status-bar">
        <div className="status-bar-section">
          {currentTrack ? `Playing: ${currentTrack.title} - ${currentTrack.artist}` : 'Ready'}
        </div>
        <div className="status-bar-section">
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
        <div className="status-bar-section">
          {isHost ? 'HOST' : canControl ? 'CO-HOST' : 'LISTENER'}
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default App;
