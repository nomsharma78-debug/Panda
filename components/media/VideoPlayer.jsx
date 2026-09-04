'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
} from 'lucide-react';

export function VideoPlayer({
  src,
  mimeType = 'video/mp4',
  autoPlay = false,
  className = '',
  poster = null,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const lastTapRef = useRef({ time: 0, x: 0 });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Ripple feedback animations for double-tap skip
  const [leftRipple, setLeftRipple] = useState(false);
  const [rightRipple, setRightRipple] = useState(false);

  // Helper to format time (hh:mm:ss or mm:ss)
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration);
    const onEnded = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Controls auto-hide timer
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSpeedMenu(false);
      }, 3000);
    }
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    resetControlsTimer();
  }, [resetControlsTimer]);

  const seekBy = useCallback((offsetSeconds) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + offsetSeconds));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    resetControlsTimer();
  }, [resetControlsTimer]);

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    resetControlsTimer();
  };

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
    resetControlsTimer();
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
    resetControlsTimer();
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  };

  const changePlaybackRate = (rate) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
    resetControlsTimer();
  };

  // Double tap / double click detection
  const handleContainerTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();
    const timeDiff = now - lastTapRef.current.time;
    const distDiff = Math.abs(clickX - lastTapRef.current.x);

    if (timeDiff < 300 && distDiff < 50) {
      // Double tap recognized
      if (clickX < width * 0.4) {
        // Left side -> Skip -10s
        seekBy(-10);
        setLeftRipple(true);
        setTimeout(() => setLeftRipple(false), 600);
      } else if (clickX > width * 0.6) {
        // Right side -> Skip +10s
        seekBy(10);
        setRightRipple(true);
        setTimeout(() => setRightRipple(false), 600);
      } else {
        // Center double-tap -> Fullscreen toggle
        toggleFullscreen();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: clickX };
      resetControlsTimer();
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'Space' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        seekBy(-10);
        setLeftRipple(true);
        setTimeout(() => setLeftRipple(false), 600);
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        seekBy(10);
        setRightRipple(true);
        setTimeout(() => setRightRipple(false), 600);
      } else if (e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekBy]);

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative group bg-black rounded-2xl overflow-hidden select-none flex items-center justify-center shadow-2xl max-h-[80vh] w-full ${className}`}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={handleContainerTap}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        poster={poster}
        playsInline
        className="w-full max-h-[75vh] object-contain cursor-pointer"
      />

      {/* Buffering Spinner */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
          <div className="w-12 h-12 rounded-full border-4 border-teal-500/30 border-t-teal-400 animate-spin" />
        </div>
      )}

      {/* Double Tap Left Feedback Ripple (-10s) */}
      {leftRipple && (
        <div className="absolute left-0 inset-y-0 w-1/3 bg-white/10 rounded-r-full flex flex-col items-center justify-center pointer-events-none animate-pulse transition-all">
          <RotateCcw className="w-10 h-10 text-white animate-spin-reverse mb-1" />
          <span className="text-xs font-bold text-white font-mono bg-black/60 px-2 py-0.5 rounded-full">-10s</span>
        </div>
      )}

      {/* Double Tap Right Feedback Ripple (+10s) */}
      {rightRipple && (
        <div className="absolute right-0 inset-y-0 w-1/3 bg-white/10 rounded-l-full flex flex-col items-center justify-center pointer-events-none animate-pulse transition-all">
          <RotateCw className="w-10 h-10 text-white animate-spin mb-1" />
          <span className="text-xs font-bold text-white font-mono bg-black/60 px-2 py-0.5 rounded-full">+10s</span>
        </div>
      )}

      {/* Floating Center Play/Pause Indicator (Shown when paused) */}
      {!isPlaying && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center shadow-glow-teal hover:scale-110 active:scale-95 transition-transform z-10"
          aria-label="Play video"
        >
          <Play className="w-8 h-8 fill-slate-950 ml-1" />
        </button>
      )}

      {/* Custom Controls Bar Overlay */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 transition-opacity duration-300 z-20 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Progress Bar with Hover Fill */}
        <div className="relative group/bar w-full h-3 flex items-center mb-2 cursor-pointer">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-white/20 group-hover/bar:h-2 rounded-lg appearance-none cursor-pointer accent-teal-400 transition-all"
            style={{
              background: `linear-gradient(to right, #2dd4bf ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%)`,
            }}
          />
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center justify-between text-slate-200 gap-2">
          {/* Left Controls: Play/Pause, 10s Skip, Volume, Time */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-lg text-white hover:text-teal-400 hover:bg-white/10 transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            {/* Skip Backward 10s Button (for Laptop/Desktop) */}
            <button
              onClick={() => seekBy(-10)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-0.5 text-xs font-semibold font-mono"
              title="Skip back 10s (Left Arrow / Double-tap left)"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-[10px]">10</span>
            </button>

            {/* Skip Forward 10s Button (for Laptop/Desktop) */}
            <button
              onClick={() => seekBy(10)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-0.5 text-xs font-semibold font-mono"
              title="Skip forward 10s (Right Arrow / Double-tap right)"
            >
              <RotateCw className="w-4 h-4" />
              <span className="text-[10px]">10</span>
            </button>

            {/* Volume Control & Slider */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                aria-label={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-teal-400 transition-all opacity-70 group-hover/vol:opacity-100"
              />
            </div>

            {/* Time Display */}
            <span className="text-[11px] font-mono text-slate-300 whitespace-nowrap ml-1">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls: Speed Selector, Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Playback Speed Menu */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="px-2 py-1 rounded-lg text-xs font-mono font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
                title="Playback speed"
              >
                <span>{playbackRate}x</span>
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 py-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col min-w-[70px] z-30">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => changePlaybackRate(rate)}
                      className={`px-3 py-1 text-xs font-mono text-left hover:bg-teal-500/20 hover:text-teal-300 transition-colors ${
                        playbackRate === rate ? 'text-teal-400 font-bold bg-teal-500/10' : 'text-slate-300'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-label={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
