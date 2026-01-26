import { useEffect, useRef, useState } from 'react';

const DRIFT_THRESHOLD = 0.5; // seconds
const HEARTBEAT_INTERVAL = 2000; // ms

export default function SyncedAudioPlayer({
  streamUrl,
  jamClient,
  onPlaybackUpdate,
  onEnded
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const heartbeatIntervalRef = useRef(null);

  // Initialize audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

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

  // Handle sync commands from server
  useEffect(() => {
    if (!jamClient) return;

    const handleSync = (state) => {
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

    jamClient.on('sync', handleSync);

    return () => {
      jamClient.off('sync', handleSync);
    };
  }, [jamClient]);

  // Send heartbeat to server
  useEffect(() => {
    if (!jamClient || !jamClient.isConnected()) return;

    const sendHeartbeat = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        jamClient.sendHeartbeat(audio.currentTime);
      }
    };

    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [jamClient]);

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
          {isPlaying ? '▶️ Playing' : '⏸️ Paused'}
        </div>
      </div>

      <input
        type="range"
        min="0"
        max={duration || 0}
        value={currentTime}
        onChange={(e) => {
          const audio = audioRef.current;
          if (audio) {
            audio.currentTime = parseFloat(e.target.value);
          }
        }}
        className="seek-bar"
      />
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
