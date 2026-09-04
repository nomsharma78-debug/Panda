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
  const rawFilename = targetMedia.original_filename || targetMedia.filename || targetMedia.name || targetMedia.object_key || '';
  const filename = rawFilename.toLowerCase();
  const mime = (targetMedia.mime_type || targetMedia.content_type || '').toLowerCase();
  const type = (targetMedia.media_type || '').toLowerCase();

  const isVideo =
    type === 'video' ||
    mime.startsWith('video/') ||
    Boolean(filename.match(/\.(mp4|webm|mov|mkv|avi|m4v|3gp|flv|wmv)(\.enc)?$/i));

  const isPdf =
    type === 'pdf' ||
    mime === 'application/pdf' ||
    Boolean(filename.match(/\.pdf(\.enc)?$/i));

  const isPhoto =
    !isVideo &&
    !isPdf &&
    (type === 'photo' ||
      type === 'image' ||
      mime.startsWith('image/') ||
      Boolean(filename.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp|heic|avif|ico|tiff)(\.enc)?$/i)));

  // Read from in-memory blob cache immediately
  const cachedUrl = (isPhoto || isVideo) && targetMedia.id ? mediaBlobCache.get(targetMedia.id) : null;
  const tokenParam = session?.access_token ? `?token=${encodeURIComponent(session.access_token)}` : '';
  const accessUrl = targetMedia.url || (targetMedia.id ? `/api/media/${targetMedia.id}/access${tokenParam}` : '');
  const downloadUrl = targetMedia.downloadUrl || (targetMedia.id ? `/api/media/${targetMedia.id}/download${tokenParam}` : '');

  const [blobUrl, setBlobUrl] = useState(cachedUrl);
  const [imgLoading, setImgLoading] = useState(!cachedUrl && (isPhoto || isVideo));
  const [imgError, setImgError] = useState(null);
  const retryCountRef = useRef(0);

  // Fetch media binary as blob for stable, reliable decrypted display
  const loadMediaBinary = useCallback(() => {
    if ((!isPhoto && !isVideo) || !targetMedia.id) {
      setBlobUrl(null);
      setImgLoading(false);
      return () => {};
    }

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
          throw new Error(`${res.status} ${errText.slice(0, 50)}`);
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
          if (retryCountRef.current < 2) {
            retryCountRef.current++;
            setTimeout(() => {
              if (!cancelled) loadMediaBinary();
            }, 1000);
          } else {
            console.warn('[MediaCard] Media load failed after retries:', targetMedia.id, err.message);
            setImgError(err.message || 'Failed to load');
            setImgLoading(false);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isPhoto, isVideo, targetMedia.id, session?.access_token]);

  useEffect(() => {
    const cleanup = loadMediaBinary();
    return cleanup;
  }, [loadMediaBinary, session?.access_token]);

  return (
    <div
      onClick={isSelectionMode ? onToggleSelect : onClick}
      className={`group relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-900 border transition-all duration-200 cursor-pointer select-none flex items-center justify-center ${
        isSelected
          ? 'border-teal-500 ring-2 ring-teal-500/50 shadow-glow-teal'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-lg'
      }`}
    >
      {/* Media Thumbnail */}
      {isPhoto ? (
        blobUrl ? (
          <img
            src={blobUrl}
            alt={targetMedia.original_filename || 'Photo'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : imgLoading ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-950">
            <div className="w-6 h-6 rounded-full border-2 border-teal-500/30 border-t-teal-400 animate-spin" />
          </div>
        ) : imgError ? (
          <div
            className="flex flex-col items-center justify-center gap-1.5 p-3 text-center cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setImgError(null); retryCountRef.current = 0; loadMediaBinary(); }}
            title="Tap to retry"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-500 flex items-center justify-center">
              <ImageOff className="w-5 h-5" />
            </div>
            <span className="text-[9px] text-slate-500 font-mono leading-tight max-w-full break-all">{imgError}</span>
            <span className="text-[9px] text-teal-400 font-semibold">Tap to retry</span>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-950">
            <div className="w-6 h-6 rounded-full border-2 border-teal-500/30 border-t-teal-400 animate-spin" />
          </div>
        )
      ) : isVideo ? (
        <div className="relative w-full h-full flex items-center justify-center bg-slate-950 group-hover:bg-slate-900 transition-colors">
          {blobUrl ? (
            <video
              src={blobUrl}
              preload="metadata"
              className="w-full h-full object-cover opacity-80 group-hover:opacity-95 transition-opacity"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-950">
              <div className="w-6 h-6 rounded-full border-2 border-teal-500/30 border-t-teal-400 animate-spin" />
            </div>
          )}
          <div className="absolute w-12 h-12 rounded-full bg-teal-500/90 text-slate-950 flex items-center justify-center shadow-glow-teal group-hover:scale-110 transition-transform pointer-events-none">
            <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
          </div>
          <span className="absolute bottom-2.5 right-2.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-mono text-white flex items-center gap-1 pointer-events-none">
            <Film className="w-3 h-3 text-teal-400" />
            <span>Video</span>
          </span>
        </div>
      ) : isPdf ? (
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-2">
            <FileText className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-mono font-semibold text-rose-300 uppercase tracking-wider">PDF</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center mb-2">
            <File className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
            {filename.split('.').pop()?.replace(/enc$/, '') || targetMedia.media_type || 'File'}
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
        className={`absolute top-2.5 left-2.5 w-6 h-6 rounded-lg flex items-center justify-center transition-all z-10 ${
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
        <div className="absolute top-2.5 right-2.5 p-1 rounded-md bg-black/60 backdrop-blur-sm border border-teal-500/30 text-teal-400 opacity-80 z-10" title="AES-256-GCM Encrypted">
          <Lock className="w-3 h-3" />
        </div>
      )}
    </div>
  );
}
