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
  const pendingSyncRef = useRef(null);
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
  const [communities, setCommunities] = useState([]);
  const [selectedCommunity, setSelectedCommunity] = useState(
    () => localStorage.getItem('jam_community') || ''
  );

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

  // Reaction state
  const [trackReactions, setTrackReactions] = useState({ likes: 0, dislikes: 0 });
  const [userReaction, setUserReaction] = useState(null);
  const [trackStarred, setTrackStarred] = useState(false); // Navidrome persistent star

  // Upload state
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccessFile, setUploadSuccessFile] = useState('');
  const [myUploads, setMyUploads] = useState([]);
  const [uploadPermanentCount, setUploadPermanentCount] = useState(0);
  const [uploadPermanentQuota, setUploadPermanentQuota] = useState(50);
  const [isLoadingUploads, setIsLoadingUploads] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Browse state
  const [musicTab, setMusicTab] = useState('browse');
  const [browseMode, setBrowseMode] = useState('artists'); // artists, albums, recent, random, favorites
  const [browseView, setBrowseView] = useState('artists');
  const [artists, setArtists] = useState(null);
  const [albumList, setAlbumList] = useState(null);
  const [favorites, setFavorites] = useState(null);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(false);
  const [repeatMode, setRepeatMode] = useState(() => {
    return localStorage.getItem('jam_repeat') === 'on';
  });

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
    // Track the current track ID so sync handler can detect changes
    let syncedTrackId = null;

    const handleRoomState = (room) => {
      setCurrentRoom(room);
      const host = room.hostId === jamClient.userId;
      const cohost = (room.coHosts || []).includes(jamClient.userId);
      setIsHost(host);
      setCanControl(host || cohost);
      setQueue(room.queue || []);
      setIsJoiningRoom(false);
      setIsCreatingRoom(false);

      // On join, load and sync to current playback state
      const ps = room.playbackState;
      if (ps.trackId) {
        syncedTrackId = ps.trackId;
        loadTrack(ps.trackId);
      }
    };

    // Handle sync events — detect track changes and load new tracks
    const handleSyncInApp = (state) => {
      // Store latest sync state so SyncedAudioPlayer can apply it on mount
      pendingSyncRef.current = state;

      if (state.trackId && state.trackId !== syncedTrackId) {
        console.log(`Track changed via sync: ${syncedTrackId} -> ${state.trackId}`);
        syncedTrackId = state.trackId;
        setTrackReactions({ likes: 0, dislikes: 0 });
        setUserReaction(null);
        loadTrack(state.trackId);
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

    const handleTrackReactions = ({ likes, dislikes, reactions }) => {
      setTrackReactions({ likes, dislikes });
      const myReaction = reactions[jamClient.userId] || null;
      setUserReaction(myReaction);
    };

    const handleDisconnected = () => {
      setIsConnected(false);
      setCurrentRoom(null);
    };

    jamClient.on('room-state', handleRoomState);
    jamClient.on('sync', handleSyncInApp);
    jamClient.on('user-joined', handleUserJoined);
    jamClient.on('user-left', handleUserLeft);
    jamClient.on('cohost-updated', handleCoHostUpdated);
    jamClient.on('queue-updated', handleQueueUpdated);
    jamClient.on('error', handleError);
    jamClient.on('disconnected', handleDisconnected);
    jamClient.on('track-reactions', handleTrackReactions);

    return () => {
      jamClient.off('room-state', handleRoomState);
      jamClient.off('sync', handleSyncInApp);
      jamClient.off('user-joined', handleUserJoined);
      jamClient.off('user-left', handleUserLeft);
      jamClient.off('cohost-updated', handleCoHostUpdated);
      jamClient.off('queue-updated', handleQueueUpdated);
      jamClient.off('error', handleError);
      jamClient.off('disconnected', handleDisconnected);
      jamClient.off('track-reactions', handleTrackReactions);
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

  // Fetch available communities for room tagging
  useEffect(() => {
    if (isAuthenticated && !currentRoom) {
      fetch(`${import.meta.env.VITE_JAM_SERVER_URL}/api/communities`)
        .then(r => r.ok ? r.json() : { communities: [] })
        .then(data => {
          setCommunities(data.communities || []);
        })
        .catch(() => {});
    }
  }, [isAuthenticated, currentRoom]);

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
      const community = selectedCommunity || null;
      const room = await jamClient.createRoom(null, username, community);
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

  const loadAlbumList = async (type) => {
    setIsLoadingBrowse(true);
    try {
      const result = await navidrome.getAlbumList(type, 500);
      const rawAlbums = result.albumList2?.album
        ? (Array.isArray(result.albumList2.album) ? result.albumList2.album : [result.albumList2.album])
        : [];

      // Group albums by name+year to merge compilations split by artist
      const grouped = new Map();
      for (const album of rawAlbums) {
        const key = `${album.name}||${album.year || ''}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            ...album,
            _albumIds: [album.id],
            _songCount: album.songCount || 0,
          });
        } else {
          const existing = grouped.get(key);
          existing._albumIds.push(album.id);
          existing._songCount += album.songCount || 0;
          // Use cover art from the entry with the most tracks
          if ((album.songCount || 0) > (existing.songCount || 0)) {
            existing.coverArt = album.coverArt;
          }
          existing.artist = 'Various Artists';
          existing.songCount = existing._songCount;
        }
      }

      setAlbumList(Array.from(grouped.values()));
    } catch (error) {
      console.error('Error loading album list:', error);
    } finally {
      setIsLoadingBrowse(false);
    }
  };

  const handleBrowseModeChange = (mode) => {
    setBrowseMode(mode);
    setBrowseView(mode === 'artists' ? 'artists' : mode === 'favorites' ? 'favorites' : 'albumList');
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setAlbumList(null);

    if (mode === 'artists') {
      loadArtists();
    } else if (mode === 'favorites') {
      loadFavorites();
    } else {
      const typeMap = { albums: 'alphabeticalByName', recent: 'newest', played: 'recent' };
      loadAlbumList(typeMap[mode]);
    }
  };

  const loadFavorites = async () => {
    setIsLoadingBrowse(true);
    try {
      const result = await navidrome.getStarred();
      const songs = result.starred2?.song
        ? (Array.isArray(result.starred2.song) ? result.starred2.song : [result.starred2.song])
        : [];
      setFavorites(songs);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setFavorites([]);
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
      const albumIds = album._albumIds || [album.id];
      const allSongs = [];

      for (const id of albumIds) {
        const result = await navidrome.getAlbum(id);
        const songs = result.album?.song
          ? (Array.isArray(result.album.song) ? result.album.song : [result.album.song])
          : [];
        allSongs.push(...songs);
      }

      // Sort by disc number then track number
      allSongs.sort((a, b) => {
        const discA = a.discNumber || 1;
        const discB = b.discNumber || 1;
        if (discA !== discB) return discA - discB;
        return (a.track || 0) - (b.track || 0);
      });

      setSelectedAlbum({ ...album, songs: allSongs });
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
      if (browseMode === 'artists') {
        setBrowseView('albums');
      } else {
        setBrowseView('albumList');
      }
    } else if (browseView === 'albums') {
      setSelectedArtist(null);
      setBrowseView('artists');
    }
  };

  // Upload constants
  const ALLOWED_EXTENSIONS = ['.mp3', '.flac', '.ogg', '.opus', '.m4a', '.wav', '.aac'];
  const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

  const getSubsonicAuth = () => ({
    username: navidrome.username,
    token: navidrome.token,
    salt: navidrome.salt,
  });

  const fetchMyUploads = async () => {
    setIsLoadingUploads(true);
    try {
      const data = await jamClient.getMyUploads(getSubsonicAuth());
      setMyUploads(data.uploads || []);
      setUploadPermanentCount(data.permanentCount || 0);
      setUploadPermanentQuota(data.permanentQuota || 50);
    } catch (err) {
      console.error('Failed to fetch uploads:', err);
    } finally {
      setIsLoadingUploads(false);
    }
  };

  const validateFile = (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 200MB`;
    }
    return null;
  };

  const handleUploadFile = async (file) => {
    const error = validateFile(file);
    if (error) {
      setUploadStatus('error');
      setUploadError(error);
      return;
    }

    setUploadStatus('uploading');
    setUploadProgress(0);
    setUploadError('');
    setUploadSuccessFile('');

    try {
      const result = await jamClient.uploadTrack(file, getSubsonicAuth(), (progress) => {
        setUploadProgress(progress);
      });
      setUploadStatus('success');
      setUploadSuccessFile(result.filename || file.name);
      setUploadProgress(100);
      fetchMyUploads();
    } catch (err) {
      setUploadStatus('error');
      setUploadError(err.message);
      setUploadProgress(null);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUploadFile(file);
    e.target.value = ''; // Reset so same file can be re-selected
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUploadFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleTogglePermanent = async (filename) => {
    try {
      await jamClient.togglePermanent(filename, getSubsonicAuth());
      fetchMyUploads();
    } catch (err) {
      console.error('Failed to toggle permanent:', err);
    }
  };

  // Load uploads when switching to upload tab
  useEffect(() => {
    if (musicTab === 'upload' && currentRoom) {
      fetchMyUploads();
    }
  }, [musicTab, currentRoom]);

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
      setTrackStarred(!!song.starred);
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

    // Re-append current track to end of queue if repeat is on
    const reappendItem = repeatMode && currentTrack
      ? { id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album }
      : null;

    if (queue.length === 0 && !reappendItem) {
      console.log('Queue is empty, playback stopped');
      return;
    }

    // Push current track to history
    if (currentTrack) {
      setPlayHistory(prev => [...prev, { id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album }]);
    }

    if (queue.length === 0 && reappendItem) {
      // Queue empty but repeat on — replay current track
      console.log(`Repeat: replaying ${currentTrack.title}`);
      jamClient.play(currentTrack.id, 0);
      loadTrack(currentTrack.id);
      return;
    }

    const nextTrack = queue[0];
    const newQueue = [...queue.slice(1), ...(reappendItem ? [reappendItem] : [])];

    console.log(`Auto-playing next track: ${nextTrack.title}${reappendItem ? ' (repeat on)' : ''}`);

    jamClient.updateQueue(newQueue);
    jamClient.play(nextTrack.id, 0);
    loadTrack(nextTrack.id);
  }, [canControl, queue, jamClient, currentTrack, repeatMode]);

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
    setTrackReactions({ likes: 0, dislikes: 0 });
    setUserReaction(null);

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

    const reappendItem = repeatMode && currentTrack
      ? { id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artist, album: currentTrack.album }
      : null;

    const nextTrack = queue[0];
    const newQueue = [...queue.slice(1), ...(reappendItem ? [reappendItem] : [])];

    jamClient.updateQueue(newQueue);
    jamClient.play(nextTrack.id, 0);
    loadTrack(nextTrack.id);
  }, [canControl, queue, jamClient, currentTrack, repeatMode]);

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

  const likeActive = userReaction === 'like' || (userReaction === null && trackStarred);


  const handleLike = useCallback(() => {
    if (!currentTrack) return;

    if (likeActive) {
      jamClient.removeReaction(currentTrack.id);
      navidrome.unstarTrack(currentTrack.id).catch(err => console.error('Unstar failed:', err));
      setUserReaction(null);
      setTrackStarred(false);
      // Remove from local favorites list
      if (favorites) setFavorites(prev => prev ? prev.filter(s => s.id !== currentTrack.id) : prev);
    } else {
      jamClient.likeTrack(currentTrack.id);
      navidrome.starTrack(currentTrack.id).catch(err => console.error('Star failed:', err));
      setUserReaction('like');
      setTrackStarred(true);
      // Refresh favorites if viewing them (new star won't have full metadata locally)
      if (browseMode === 'favorites') loadFavorites();
    }
  }, [currentTrack, userReaction, likeActive, jamClient, navidrome, favorites, browseMode]);

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
                {communities.length > 0 && (
                  <div className="community-select-group">
                    <label className="community-label">Community (optional)</label>
                    <select
                      className="win98-input"
                      value={selectedCommunity}
                      onChange={(e) => {
                        setSelectedCommunity(e.target.value);
                        localStorage.setItem('jam_community', e.target.value);
                      }}
                      disabled={isCreatingRoom || isJoiningRoom}
                    >
                      <option value="">None</option>
                      {communities.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                pendingSyncRef={pendingSyncRef}
              />
            )}

            {currentTrack && (
              <div className="transport-controls">
                {canControl && (
                  <>
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
                    <button
                      className={`transport-btn repeat-btn${repeatMode ? ' repeat-active' : ''}`}
                      onClick={() => {
                        const next = !repeatMode;
                        setRepeatMode(next);
                        localStorage.setItem('jam_repeat', next ? 'on' : 'off');
                      }}
                      title={repeatMode ? 'Repeat: ON' : 'Repeat: OFF'}
                    >
                      <span className="transport-icon repeat-icon"></span>
                    </button>
                    <div className="transport-separator"></div>
                  </>
                )}
                <button
                  className={`transport-btn like-btn${likeActive ? ' active' : ''}`}
                  onClick={handleLike}
                  title={likeActive ? 'Remove like' : 'Like this track'}
                >
                  <span className="transport-icon like-icon"></span>
                </button>
              </div>
            )}

            <hr className="retro-divider" />

            {/* Music tabs: Browse | Search | Queue (mobile) | People (mobile) */}
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
              <button
                className={`auth-tab desktop-tab ${musicTab === 'upload' ? 'active' : ''}`}
                onClick={() => setMusicTab('upload')}
              >
                Upload
              </button>
              <button
                className={`auth-tab mobile-tab ${musicTab === 'queue' ? 'active' : ''}`}
                onClick={() => setMusicTab('queue')}
              >
                Queue ({queue.length})
              </button>
              <button
                className={`auth-tab mobile-tab ${musicTab === 'people' ? 'active' : ''}`}
                onClick={() => setMusicTab('people')}
              >
                People ({currentRoom.users?.length || 0})
              </button>
            </div>

            <div className="music-tab-content">
              {musicTab === 'queue' ? (
                <div className="mobile-queue-panel">
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
              ) : musicTab === 'people' ? (
                <div className="mobile-users-panel">
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
              ) : musicTab === 'upload' ? (
                <div className="upload-panel">
                  <div className="upload-zone-section">
                    <div
                      className={`upload-dropzone${isDragOver ? ' dragover' : ''}`}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                    >
                      <div className="upload-dropzone-text">
                        Drag &amp; drop an audio file here
                      </div>
                      <div className="upload-or">- or -</div>
                      <label className="win98-btn upload-browse-btn">
                        Browse Files...
                        <input
                          type="file"
                          accept=".mp3,.flac,.ogg,.opus,.m4a,.wav,.aac"
                          onChange={handleFileSelect}
                          style={{ display: 'none' }}
                          disabled={uploadStatus === 'uploading'}
                        />
                      </label>
                      <div className="upload-formats">
                        Formats: MP3, FLAC, OGG, OPUS, M4A, WAV, AAC (max 200MB)
                      </div>
                    </div>

                    {uploadStatus === 'uploading' && (
                      <div className="upload-progress-section">
                        <div className="upload-progress-label">
                          Uploading... {uploadProgress}%
                        </div>
                        <div className="upload-progress-track">
                          <div
                            className="upload-progress-fill"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {uploadStatus === 'success' && (
                      <div className="upload-success">
                        Uploaded: {uploadSuccessFile}<br />
                        <small>Navidrome will index this file within ~1 minute. Then it will appear in search.</small>
                      </div>
                    )}

                    {uploadStatus === 'error' && (
                      <div className="error">{uploadError}</div>
                    )}
                  </div>

                  <hr className="retro-divider" />

                  <div className="my-uploads-section">
                    <div className="my-uploads-header">
                      <strong>My Uploads</strong>
                      <span className="upload-quota">
                        Permanent: {uploadPermanentCount}/{uploadPermanentQuota}
                      </span>
                      <button
                        className="win98-btn upload-refresh-btn"
                        onClick={fetchMyUploads}
                        disabled={isLoadingUploads}
                      >
                        Refresh
                      </button>
                    </div>

                    {isLoadingUploads ? (
                      <div className="browse-loading">Loading uploads...</div>
                    ) : myUploads.length === 0 ? (
                      <div className="browse-empty">No uploads yet</div>
                    ) : (
                      <ul className="my-uploads-list">
                        {myUploads.map((upload) => (
                          <li key={upload.filename} className="upload-item">
                            <div className="upload-item-info">
                              <strong>{upload.filename}</strong>
                              <span>{new Date(upload.uploadedAt).toLocaleDateString()}</span>
                            </div>
                            <label className="upload-permanent-toggle" title={upload.permanent ? 'Marked permanent' : 'Will expire after 30 days'}>
                              <input
                                type="checkbox"
                                checked={upload.permanent}
                                onChange={() => handleTogglePermanent(upload.filename)}
                              />
                              Keep
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : musicTab === 'search' ? (
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
                  {/* Browse mode selector + breadcrumb */}
                  <div className="browse-toolbar">
                    <select
                      className="browse-mode-select"
                      value={browseMode}
                      onChange={(e) => handleBrowseModeChange(e.target.value)}
                    >
                      <option value="favorites">&#9733; Favorites</option>
                      <option value="artists">Artists</option>
                      <option value="albums">Albums A-Z</option>
                      <option value="recent">Recently Added</option>
                      <option value="played">Recently Played</option>
                    </select>
                  </div>
                  <div className="browse-breadcrumb">
                    <span
                      className={(browseView === 'artists' || browseView === 'albumList' || browseView === 'favorites') ? 'current' : 'clickable'}
                      onClick={() => handleBrowseModeChange(browseMode)}
                    >
                      {browseMode === 'favorites' ? '★ Favorites' : 'Library'}
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

                  {/* Album list view (Albums A-Z, Recent, Random) */}
                  {!isLoadingBrowse && browseView === 'albumList' && (
                    <div className="browse-list">
                      {albumList && albumList.length > 0 ? (
                        <ul>
                          {albumList.map((album) => (
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
                                <span>{album.artist}{album.year ? ` \u2022 ${album.year}` : ''}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="browse-empty">No albums found</div>
                      )}
                    </div>
                  )}

                  {/* Albums list (artist drill-down) */}
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
                                <span>
                                  {song.artist && song.artist !== selectedArtist?.name && (
                                    <span className="song-artist-name">{song.artist} &middot; </span>
                                  )}
                                  {formatDuration(song.duration)}
                                </span>
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

                  {/* Favorites list */}
                  {!isLoadingBrowse && browseView === 'favorites' && (
                    <div className="browse-list favorites-list">
                      {favorites && favorites.length > 0 ? (
                        <>
                          <div className="favorites-header">
                            <span className="favorites-count">{favorites.length} starred track{favorites.length !== 1 ? 's' : ''}</span>
                            {canControl && (
                              <button
                                className="win98-btn"
                                style={{ fontSize: 10, padding: '2px 8px' }}
                                onClick={() => {
                                  const items = favorites.map(s => ({ id: s.id, title: s.title, artist: s.artist, album: s.album }));
                                  if (!currentTrack && items.length > 0) {
                                    const [first, ...rest] = items;
                                    jamClient.updateQueue([...queue, ...rest]);
                                    jamClient.play(first.id, 0);
                                    loadTrack(first.id);
                                  } else {
                                    jamClient.updateQueue([...queue, ...items]);
                                  }
                                }}
                              >
                                Queue All
                              </button>
                            )}
                          </div>
                          <ul>
                            {favorites.map((song) => (
                              <li key={song.id} className="song-item">
                                <div className="song-info">
                                  <strong>{song.title}</strong>
                                  <span>{song.artist} &middot; {song.album}{song.duration ? ` &middot; ${formatDuration(song.duration)}` : ''}</span>
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
                        </>
                      ) : (
                        <div className="browse-empty favorites-empty">
                          <span className="favorites-empty-star">&#9734;</span>
                          <p>No favorites yet</p>
                          <p className="favorites-hint">Like a track during playback to add it here</p>
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
