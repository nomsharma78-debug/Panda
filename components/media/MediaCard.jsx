'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  FileText,
  Check,
  Film,
  File,
  Lock,
  ImageOff,
} from 'lucide-react';
import { formatBytes } from '@/components/ui/Progress';
import { useAuth } from '@/components/context/AuthContext';
import { mediaBlobCache } from '@/lib/client-cache';

export function MediaCard({
  media,
  item,
  isSelected = false,
  isSelectionMode = false,
  onToggleSelect,
  onClick,
  onDelete,
}) {
  const { session, loading: authLoading } = useAuth();
  const targetMedia = media || item || {};
  const isPhoto = targetMedia.media_type === 'photo';
  const isVideo = targetMedia.media_type === 'video';
  const isPdf = targetMedia.media_type === 'pdf';

  // Read from in-memory blob cache immediately
  const cachedUrl = isPhoto && targetMedia.id ? mediaBlobCache.get(targetMedia.id) : null;
  const [blobUrl, setBlobUrl] = useState(cachedUrl);
  const [imgLoading, setImgLoading] = useState(!cachedUrl && isPhoto);
  const [imgError, setImgError] = useState(null);
  const retryCountRef = useRef(0);

  // Build access URL with token for video/download
  const tokenParam = session?.access_token ? `?token=${encodeURIComponent(session.access_token)}` : '';
  const accessUrl = targetMedia.id ? `/api/media/${targetMedia.id}/access${tokenParam}` : '';
  const downloadUrl = targetMedia.id ? `/api/media/${targetMedia.id}/download${tokenParam}` : '';

  // Fetch photo as blob for stable, reliable display
  const loadImage = useCallback(() => {
    if (!isPhoto || !targetMedia.id) {
      setBlobUrl(null);
      setImgLoading(false);
      return () => {};
    }

    // If already in memory cache, use it directly (0ms)
    const inCache = mediaBlobCache.get(targetMedia.id);
    if (inCache) {
      setBlobUrl(inCache);
      setImgLoading(false);
      setImgError(null);
      return () => {};
    }

    let cancelled = false;
    setImgLoading(true);
    setImgError(null);

    const tokenQuery = session?.access_token ? `?token=${encodeURIComponent(session.access_token)}` : '';
    const mediaUrl = `/api/media/${targetMedia.id}/access${tokenQuery}`;
    const fetchHeaders = {};
    if (session?.access_token) {
      fetchHeaders['Authorization'] = `Bearer ${session.access_token}`;
    }

    fetch(mediaUrl, { headers: fetchHeaders, credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`${res.status} ${errText.slice(0, 80)}`);
        }
        return res.blob();
      })
      .then((blob) => {
        if (!cancelled) {
          const url = URL.createObjectURL(blob);
          mediaBlobCache.set(targetMedia.id, url);
          setBlobUrl(url);
          setImgLoading(false);
          setImgError(null);
          retryCountRef.current = 0;
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[MediaCard] Image load failed:', targetMedia.id, err.message);
          setImgError(err.message);
          setImgLoading(false);
          // Auto-retry once after 1.5s if 401 (auth might still be initializing)
          if (retryCountRef.current < 1 && err.message.includes('401')) {
            retryCountRef.current++;
            setTimeout(() => {
              if (!cancelled) loadImage();
            }, 1500);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isPhoto, targetMedia.id, session?.access_token]);

  useEffect(() => {
    const cleanup = loadImage();
    return cleanup;
  }, [loadImage]);


  const timeStr = targetMedia.uploaded_at
    ? new Date(targetMedia.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      onClick={isSelectionMode ? onToggleSelect : onClick}
      className={`group relative rounded-2xl overflow-hidden bg-slate-900 border transition-all duration-200 cursor-pointer select-none flex flex-col ${
        isSelected
          ? 'border-teal-500 ring-2 ring-teal-500/50 shadow-glow-teal'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-lg'
      }`}
    >
      {/* Media Thumbnail Container */}
      <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {isPhoto ? (
          imgLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-teal-500/40 border-t-teal-500 animate-spin" />
            </div>
          ) : imgError ? (
            <div
              className="flex flex-col items-center justify-center gap-1.5 p-3 text-center cursor-pointer"
              onClick={(e) => { e.stopPropagation(); retryCountRef.current = 0; loadImage(); }}
              title="Tap to retry"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-500 flex items-center justify-center">
                <ImageOff className="w-5 h-5" />
              </div>
              <span className="text-[9px] text-slate-500 font-mono leading-tight max-w-full break-all">{imgError}</span>
              <span className="text-[9px] text-teal-400 font-semibold">Tap to retry</span>
            </div>
          ) : (
            <img
              src={blobUrl}
              alt={targetMedia.original_filename || 'Photo'}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          )
        ) : isVideo ? (
          <div className="relative w-full h-full flex items-center justify-center bg-slate-900/90 group-hover:bg-slate-900 transition-colors">
            <video
              src={accessUrl}
              preload="metadata"
              className="w-full h-full object-cover opacity-70"
            />
            <div className="absolute w-12 h-12 rounded-full bg-teal-500/90 text-slate-950 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
            </div>
            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white flex items-center gap-1">
              <Film className="w-3 h-3" />
              <span>Video</span>
            </span>
          </div>
        ) : isPdf ? (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-2">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-mono font-semibold text-rose-300 uppercase tracking-wider">PDF Document</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center mb-2">
              <File className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
              {targetMedia.media_type || 'File'}
            </span>
          </div>
        )}

        {/* Selection Checkbox Pill */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={`absolute top-2.5 left-2.5 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-teal-500 text-slate-950 opacity-100 shadow-md'
              : 'bg-black/60 border border-white/20 text-transparent hover:border-teal-400 opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Select file"
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </button>

        {/* Encrypted Badge Indicator */}
        {targetMedia.encrypted && (
          <div className="absolute top-2.5 right-2.5 p-1 rounded-md bg-black/60 backdrop-blur-sm border border-teal-500/30 text-teal-400 opacity-80" title="AES-256-GCM Encrypted">
            <Lock className="w-3 h-3" />
          </div>
        )}
      </div>

      {/* Card Info Footer */}
      <div className="p-3 bg-slate-900/90 flex flex-col gap-1 border-t border-slate-800">
        <p className="text-xs font-medium text-slate-200 truncate" title={targetMedia.original_filename}>
          {targetMedia.original_filename}
        </p>
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{formatBytes(targetMedia.file_size)}</span>
          <span>{timeStr}</span>
        </div>
      </div>
    </div>
  );
}
