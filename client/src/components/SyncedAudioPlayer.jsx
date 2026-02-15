import { useEffect, useRef, useState } from 'react';

const DRIFT_THRESHOLD = 0.5; // seconds
const HEARTBEAT_INTERVAL = 2000; // ms

export default function SyncedAudioPlayer({
  streamUrl,
  jamClient,
  isHost,
  isConnected,
  onPlaybackUpdate,
  onEnded,
  audioRef: externalAudioRef,
  pendingSyncRef
}) {
  const internalAudioRef = useRef(null);
  // Use external ref if provided, otherwise use internal ref
  const audioRef = externalAudioRef || internalAudioRef;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    // Load saved volume from localStorage, default to 1.0 (100%)
    const savedVolume = localStorage.getItem('audio_volume');
    return savedVolume ? parseFloat(savedVolume) : 1.0;
  });
  const heartbeatIntervalRef = useRef(null);

  // Set initial volume on audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  // Initialize audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Set initial volume
    audio.volume = volume;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onPlaybackUpdate?.(audio.currentTime, audio.paused);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onPlaybackUpdate, onEnded]);

  // Apply a sync state to the audio element
  const applySyncState = (state) => {
    const audio = audioRef.current;
    if (!audio) return;

    console.log('Applying sync:', state);

    // Calculate expected position accounting for network latency
    const latency = Date.now() - state.timestamp;
    const expectedPosition = state.position + (state.playing ? latency / 1000 : 0);

    // Check for drift
    const drift = Math.abs(audio.currentTime - expectedPosition);
    console.log(`Drift: ${drift.toFixed(3)}s`);

    if (drift > DRIFT_THRESHOLD) {
      console.log(`Correcting drift: seeking to ${expectedPosition.toFixed(2)}s`);
      audio.currentTime = expectedPosition;
    }

    // Sync play/pause state
    if (state.playing && audio.paused) {
      audio.play().catch(err => console.error('Playback error:', err));
    } else if (!state.playing && !audio.paused) {
      audio.pause();
    }
  };

  // Handle sync commands from server
  useEffect(() => {
    if (!jamClient) return;

    jamClient.on('sync', applySyncState);

    return () => {
      jamClient.off('sync', applySyncState);
    };
  }, [jamClient]);

  // Apply pending sync state on mount (handles join-in-progress)
  useEffect(() => {
    if (!pendingSyncRef?.current) return;

    const audio = audioRef.current;
    if (!audio) return;

    // Wait for audio to be ready enough to seek/play
    const applyPending = () => {
      const pending = pendingSyncRef.current;
      if (pending) {
        console.log('Applying pending sync state on mount');
        applySyncState(pending);
        pendingSyncRef.current = null;
      }
    };

    if (audio.readyState >= 1) {
      applyPending();
    } else {
      audio.addEventListener('loadedmetadata', applyPending, { once: true });
      return () => audio.removeEventListener('loadedmetadata', applyPending);
    }
  }, [streamUrl]);

  // Send heartbeat to server
  useEffect(() => {
    // Only start heartbeat when connected
    if (!jamClient || !isConnected) return;

    console.log('Starting heartbeat interval');

    const sendHeartbeat = () => {
      const audio = audioRef.current;
      const position = audio ? audio.currentTime : 0;
      jamClient.sendHeartbeat(position);
    };

    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => {
      console.log('Stopping heartbeat interval');
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [jamClient, isConnected]);

  return (
    <div className="synced-audio-player">
      <audio
        ref={audioRef}
        src={streamUrl}
        preload="auto"
      />

      <div className="playback-info">
        <div className="time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div className="status">
          {isPlaying ? '> Playing' : '|| Paused'}
        </div>
      </div>

      <input
        type="range"
        min="0"
        max={duration || 0}
        value={currentTime}
        onChange={(e) => {
          const newPosition = parseFloat(e.target.value);
          const audio = audioRef.current;

          if (audio) {
            audio.currentTime = newPosition;

            // If host, emit seek event to sync with other users
            if (isHost && jamClient) {
              jamClient.seek(newPosition);
            }
          }
        }}
        className="seek-bar"
        disabled={!isHost}
        title={isHost ? 'Drag to seek' : 'Only host can seek'}
      />

      <div className="volume-control">
        <label htmlFor="volume-slider">
          Vol: {Math.round(volume * 100)}%
        </label>
        <input
          id="volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => {
            const newVolume = parseFloat(e.target.value);
            setVolume(newVolume);
            // Save to localStorage for persistence
            localStorage.setItem('audio_volume', newVolume.toString());
          }}
          className="volume-slider"
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
      </div>
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
