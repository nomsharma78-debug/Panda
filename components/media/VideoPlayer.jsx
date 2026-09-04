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
  Settings,
  Repeat,
  PictureInPicture2,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Zap,
  Check,
} from 'lucide-react';

export function VideoPlayer({
  src,
  mimeType = 'video/mp4',
  autoPlay = false,
  className = '',
  poster = null,
  title = '',
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const progressBarRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const lastTapRef = useRef({ time: 0, x: 0 });
  const holdTimerRef = useRef(null);
  const isHoldingRef = useRef(false);

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isHolding2x, setIsHolding2x] = useState(false);

  // Floating menus & tooltips
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSubmenu, setSettingsSubmenu] = useState(null); // 'speed' | null
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPos, setHoverPos] = useState(0);
  const [centerAction, setCenterAction] = useState(null); // 'play' | 'pause' | null

  // YouTube double-tap ripple animations
  const [leftSkipRipple, setLeftSkipRipple] = useState(false);
  const [rightSkipRipple, setRightSkipRipple] = useState(false);

  // Time formatter (YouTube style: mm:ss or hh:mm:ss)
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Video event listeners & buffer tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered && video.buffered.length > 0) {
        try {
          const end = video.buffered.end(video.buffered.length - 1);
          setBufferedEnd(end);
        } catch {}
      }
    };
    const onLoadedMetadata = () => {
      setDuration(video.duration);
    };
    const onEnded = () => {
      if (!video.loop) {
        setIsPlaying(false);
      }
    };
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
    if (isPlaying && !showSettings) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2800);
    }
  }, [isPlaying, showSettings]);

  const triggerCenterAction = (type) => {
    setCenterAction(type);
    setTimeout(() => setCenterAction(null), 500);
  };

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
      triggerCenterAction('play');
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      triggerCenterAction('pause');
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

  const handleProgressBarMouseMove = (e) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPos(pos * 100);
    setHoverTime(pos * duration);
  };

  const handleProgressBarClick = (e) => {
    if (!progressBarRef.current || !videoRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * duration;
    videoRef.current.currentTime = target;
    setCurrentTime(target);
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
        container.requestFullscreen().catch(() => {});
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {}
  };

  const toggleLoop = () => {
    if (!videoRef.current) return;
    const nextLoop = !isLooping;
    videoRef.current.loop = nextLoop;
    setIsLooping(nextLoop);
    setShowSettings(false);
  };

  const changePlaybackRate = (rate) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
    setSettingsSubmenu(null);
    resetControlsTimer();
  };

  // Hold mouse/screen down for YouTube 2x speed feature
  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || showSettings) return;
    holdTimerRef.current = setTimeout(() => {
      if (videoRef.current && isPlaying) {
        isHoldingRef.current = true;
        videoRef.current.playbackRate = 2;
        setIsHolding2x(true);
      }
    }, 450);
  };

  const handleMouseUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }
    if (isHoldingRef.current && videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      setIsHolding2x(false);
      isHoldingRef.current = false;
    }
  };

  // Double tap / double click detection (YouTube style)
  const handleContainerTap = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || showSettings) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();
    const timeDiff = now - lastTapRef.current.time;
    const distDiff = Math.abs(clickX - lastTapRef.current.x);

    if (timeDiff < 320 && distDiff < 60) {
      // YouTube double tap action
      if (clickX < width * 0.38) {
        // Left side -> Skip -10s
        seekBy(-10);
        setLeftSkipRipple(true);
        setTimeout(() => setLeftSkipRipple(false), 650);
      } else if (clickX > width * 0.62) {
        // Right side -> Skip +10s
        seekBy(10);
        setRightSkipRipple(true);
        setTimeout(() => setRightSkipRipple(false), 650);
      } else {
        // Center double tap -> Fullscreen
        toggleFullscreen();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: clickX };
      // Single tap -> Play / Pause
      togglePlay();
    }
  };

  // YouTube Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'j':
          e.preventDefault();
          seekBy(-10);
          setLeftSkipRipple(true);
          setTimeout(() => setLeftSkipRipple(false), 650);
          break;
        case 'l':
          e.preventDefault();
          seekBy(10);
          setRightSkipRipple(true);
          setTimeout(() => setRightSkipRipple(false), 650);
          break;
        case 'arrowleft':
          e.preventDefault();
          seekBy(-5);
          break;
        case 'arrowright':
          e.preventDefault();
          seekBy(5);
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.min(1, v + 0.05);
            if (videoRef.current) {
              videoRef.current.volume = nv;
              videoRef.current.muted = false;
            }
            setIsMuted(false);
            return nv;
          });
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume((v) => {
            const nv = Math.max(0, v - 0.05);
            if (videoRef.current) {
              videoRef.current.volume = nv;
              videoRef.current.muted = nv === 0;
            }
            setIsMuted(nv === 0);
            return nv;
          });
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'i':
        case 'p':
          e.preventDefault();
          togglePiP();
          break;
        default:
          // Numeric keys 0-9 to jump to 0%-90% of duration
          if (/^[0-9]$/.test(e.key) && duration) {
            e.preventDefault();
            const percent = parseInt(e.key, 10) / 10;
            const target = percent * duration;
            if (videoRef.current) videoRef.current.currentTime = target;
            setCurrentTime(target);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekBy, duration]);

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const bufferPercent = duration ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative group/player bg-black rounded-2xl overflow-hidden select-none flex items-center justify-center shadow-2xl max-h-[85vh] w-full ${className}`}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => {
        if (isPlaying) setShowControls(false);
        handleMouseUp();
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      onClick={handleContainerTap}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        poster={poster}
        playsInline
        className="w-full max-h-[80vh] object-contain cursor-pointer"
      />

      {/* 2x Speed Pill (YouTube Hold Feature) */}
      {isHolding2x && (
        <div className="absolute top-6 inset-x-0 mx-auto w-fit px-4 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-white flex items-center gap-2 text-xs font-semibold z-30 animate-bounce">
          <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span>2x Speed</span>
        </div>
      )}

      {/* Buffering Spinner */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/30 z-20">
          <div className="w-14 h-14 rounded-full border-4 border-teal-500/30 border-t-teal-400 animate-spin" />
        </div>
      )}

      {/* Double Tap Left Ripple (-10s) */}
      {leftSkipRipple && (
        <div className="absolute left-0 inset-y-0 w-1/3 bg-teal-500/10 rounded-r-full flex flex-col items-center justify-center pointer-events-none z-20 transition-all">
          <div className="flex items-center text-teal-300 -space-x-2 mb-1">
            <ChevronsLeft className="w-8 h-8 animate-pulse" />
          </div>
          <span className="text-xs font-bold text-white font-mono bg-black/80 border border-teal-500/30 px-2.5 py-0.5 rounded-full shadow-lg">
            10 seconds
          </span>
        </div>
      )}

      {/* Double Tap Right Ripple (+10s) */}
      {rightSkipRipple && (
        <div className="absolute right-0 inset-y-0 w-1/3 bg-teal-500/10 rounded-l-full flex flex-col items-center justify-center pointer-events-none z-20 transition-all">
          <div className="flex items-center text-teal-300 -space-x-2 mb-1">
            <ChevronsRight className="w-8 h-8 animate-pulse" />
          </div>
          <span className="text-xs font-bold text-white font-mono bg-black/80 border border-teal-500/30 px-2.5 py-0.5 rounded-full shadow-lg">
            10 seconds
          </span>
        </div>
      )}

      {/* Center Play/Pause Pop Action Feedback */}
      {centerAction && (
        <div className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-slate-950/80 border border-teal-500/40 backdrop-blur-sm text-teal-300 flex items-center justify-center pointer-events-none z-20 animate-ping opacity-90 shadow-[0_0_20px_rgba(45,212,191,0.5)]">
          {centerAction === 'play' ? (
            <Play className="w-10 h-10 fill-teal-400 ml-1 text-teal-400" />
          ) : (
            <Pause className="w-10 h-10 fill-teal-400 text-teal-400" />
          )}
        </div>
      )}

      {/* Video Controls Gradient Overlay */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-8 sm:pt-10 pb-2.5 sm:pb-3 px-3 sm:px-4 transition-opacity duration-200 z-20 w-full ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber Progress Bar */}
        <div
          ref={progressBarRef}
          className="relative group/scrubber w-full h-4 flex items-end mb-2 cursor-pointer"
          onMouseMove={handleProgressBarMouseMove}
          onMouseLeave={() => setHoverTime(null)}
          onClick={handleProgressBarClick}
        >
          {/* Hover Time Bubble Tooltip */}
          {hoverTime !== null && (
            <div
              className="absolute -top-7 transform -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900 text-[11px] font-mono font-semibold text-teal-300 pointer-events-none border border-teal-500/40 shadow-[0_2px_10px_rgba(0,0,0,0.8)]"
              style={{ left: `${hoverPos}%` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}

          {/* Background Bar Track */}
          <div className="relative w-full h-1 group-hover/scrubber:h-1.5 bg-white/20 rounded-full overflow-visible transition-all duration-150">
            {/* Buffer Progress Bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-white/40 rounded-full"
              style={{ width: `${bufferPercent}%` }}
            />

            {/* Played Progress Bar (Panda Teal) */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-teal-400 rounded-full shadow-[0_0_8px_rgba(45,212,191,0.6)]"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Scrubber Dot Handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.9)] scale-0 group-hover/scrubber:scale-100 transition-transform duration-150"
              style={{ left: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Video Controls Row */}
        <div className="flex items-center justify-between text-white text-xs w-full gap-2">
          {/* Left Buttons: Play, Next/Skip, Volume, Time */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 overflow-hidden">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="p-1 shrink-0 text-white hover:text-teal-300 transition-colors focus:outline-none"
              aria-label={isPlaying ? 'Pause (k)' : 'Play (k)'}
              title={isPlaying ? 'Pause (k)' : 'Play (k)'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </button>

            {/* Skip -10s Button (Hidden on very narrow containers) */}
            <button
              onClick={() => seekBy(-10)}
              className="p-1 shrink-0 text-slate-300 hover:text-teal-300 transition-colors hidden sm:inline-flex"
              title="Rewind 10 seconds (j)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Skip +10s Button (Hidden on very narrow containers) */}
            <button
              onClick={() => seekBy(10)}
              className="p-1 shrink-0 text-slate-300 hover:text-teal-300 transition-colors hidden sm:inline-flex"
              title="Fast forward 10 seconds (l)"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume Control Group with Expandable Slider */}
            <div className="flex items-center group/vol shrink-0">
              <button
                onClick={toggleMute}
                className="p-1 text-white hover:text-teal-300 transition-colors focus:outline-none"
                aria-label={isMuted ? 'Unmute (m)' : 'Mute (m)'}
                title={isMuted ? 'Unmute (m)' : 'Mute (m)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-rose-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-0 group-hover/vol:w-14 sm:group-hover/vol:w-16 focus:w-14 sm:focus:w-16 transition-all duration-200 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-teal-400 ml-1 opacity-0 group-hover/vol:opacity-100 focus:opacity-100"
              />
            </div>

            {/* Current Time / Total Duration */}
            <div className="text-[11px] sm:text-xs font-mono text-slate-300 ml-0.5 select-none shrink-0 truncate">
              <span className="text-teal-300 font-semibold">{formatTime(currentTime)}</span>
              <span className="mx-1 text-slate-500">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Buttons: Loop, PiP, Settings, Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
            {/* Picture-in-Picture */}
            <button
              onClick={togglePiP}
              className="p-1.5 shrink-0 text-slate-300 hover:text-white transition-colors hidden sm:inline-flex"
              title="Miniplayer / Picture in Picture (p)"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>

            {/* Settings Menu Gear */}
            <div className="relative shrink-0">
              <button
                onClick={() => {
                  setShowSettings(!showSettings);
                  setSettingsSubmenu(null);
                }}
                className={`p-1.5 shrink-0 rounded-lg transition-transform duration-200 ${
                  showSettings ? 'text-teal-400 rotate-45' : 'text-slate-300 hover:text-white'
                }`}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Settings Pop-up Menu */}
              {showSettings && (
                <div className="absolute bottom-full right-0 mb-3 w-48 sm:w-52 max-w-[calc(100vw-2rem)] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-2 z-40 text-xs animate-slide-up">
                  {settingsSubmenu === 'speed' ? (
                    <div>
                      <div
                        onClick={() => setSettingsSubmenu(null)}
                        className="flex items-center gap-2 p-2 text-slate-400 hover:text-white cursor-pointer border-b border-slate-800 mb-1"
                      >
                        <ChevronRight className="w-4 h-4 rotate-180" />
                        <span className="font-semibold text-white">Playback Speed</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                          <div
                            key={rate}
                            onClick={() => changePlaybackRate(rate)}
                            className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                              playbackRate === rate
                                ? 'bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/30'
                                : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <span>{rate === 1 ? 'Normal' : `${rate}x`}</span>
                            {playbackRate === rate && <Check className="w-3.5 h-3.5 text-teal-400" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {/* Speed Row */}
                      <div
                        onClick={() => setSettingsSubmenu('speed')}
                        className="flex items-center justify-between p-2 rounded-xl text-slate-200 hover:bg-white/10 cursor-pointer transition-colors"
                      >
                        <span>Playback speed</span>
                        <div className="flex items-center gap-1 text-teal-300 font-mono">
                          <span>{playbackRate === 1 ? 'Normal' : `${playbackRate}x`}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      {/* Loop Row */}
                      <div
                        onClick={toggleLoop}
                        className="flex items-center justify-between p-2 rounded-xl text-slate-200 hover:bg-white/10 cursor-pointer transition-colors"
                      >
                        <span>Loop</span>
                        <span className="font-mono text-teal-300">{isLooping ? 'On' : 'Off'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 shrink-0 text-white hover:text-teal-300 transition-colors focus:outline-none"
              aria-label={isFullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
              title={isFullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
