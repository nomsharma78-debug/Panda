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
  Palette,
} from 'lucide-react';
import { formatBytes } from '@/components/ui/Progress';
import { useAuth } from '@/components/context/AuthContext';
import { mediaBlobCache } from '@/lib/client-cache';

export const MediaCard = React.memo(function MediaCard({
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

  const isCdr =
    type === 'cdr' ||
    mime.includes('cdr') ||
    mime.includes('coreldraw') ||
    Boolean(filename.match(/\.cdr(\.enc)?$/i));

  const isPhoto =
    !isVideo &&
    !isPdf &&
    !isCdr &&
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
  const [resolvedMime, setResolvedMime] = useState(null);
  const [imgLoading, setImgLoading] = useState(!cachedUrl && (isPhoto || isVideo));
  const [imgError, setImgError] = useState(null);
  const retryCountRef = useRef(0);

  const effectiveIsVideo =
    isVideo ||
    (resolvedMime && resolvedMime.startsWith('video/'));

  const effectiveIsPhoto =
    !effectiveIsVideo &&
    !isPdf &&
    !isCdr &&
    (isPhoto || (resolvedMime && resolvedMime.startsWith('image/')));

  // Fetch media binary as blob for stable, reliable decrypted display
  const loadMediaBinary = useCallback(() => {
    if (!targetMedia.id) {
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

    // Wait if auth context is still actively checking session
    if (authLoading) {
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
        const contentType = res.headers.get('content-type') || '';
        const blob = await res.blob();
        return { blob, contentType };
      })
      .then(({ blob, contentType }) => {
        if (!cancelled) {
          const finalMime = contentType || blob.type || '';
          if (finalMime) setResolvedMime(finalMime);

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
          if (retryCountRef.current < 3) {
            const retryDelay = Math.min(300 * Math.pow(2, retryCountRef.current), 1500);
            retryCountRef.current++;
            setTimeout(() => {
              if (!cancelled) loadMediaBinary();
            }, retryDelay);
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
  }, [targetMedia.id, session?.access_token, authLoading]);

  useEffect(() => {
    const cleanup = loadMediaBinary();
    return cleanup;
  }, [loadMediaBinary, session?.access_token, authLoading]);

  return (
    <div
      onClick={(e) => {
        if (isSelectionMode && typeof onToggleSelect === 'function') {
          onToggleSelect(targetMedia);
        } else if (typeof onClick === 'function') {
          onClick(targetMedia);
        }
      }}
      className={`group relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-900 border transition-all duration-200 cursor-pointer select-none flex items-center justify-center ${
        isSelected
          ? 'border-teal-500 ring-2 ring-teal-500/50 shadow-glow-teal'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-lg'
      }`}
    >
      {/* Media Thumbnail */}
      {effectiveIsPhoto ? (
        blobUrl ? (
          <img
            src={blobUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => {
              setBlobUrl(null);
              setImgError('Could not render image');
            }}
          />
        ) : imgLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-950/40">
            <div className="w-5 h-5 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-2" />
            <span className="text-[10px] text-slate-500 font-mono">Decrypting...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-3 text-center">
            <ImageOff className="w-6 h-6 text-slate-600 mb-1" />
            <span className="text-[10px] text-slate-400 font-mono">
              {imgError || 'Decryption Error'}
            </span>
          </div>
        )
      ) : effectiveIsVideo ? (
        blobUrl ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black group">
            <video
              src={blobUrl}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              muted
              playsInline
              preload="metadata"
            />
            <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-slate-950/80 border border-teal-500/40 text-teal-400 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="w-4 h-4 ml-0.5 fill-teal-400" />
              </div>
            </div>
          </div>
        ) : imgLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-950/40">
            <div className="w-5 h-5 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-2" />
            <span className="text-[10px] text-slate-500 font-mono">Decrypting video...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Film className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
              {filename.split('.').pop()?.replace(/enc$/, '') || 'VIDEO'}
            </span>
          </div>
        )
      ) : isPdf ? (
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <FileText className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
            PDF
          </span>
          <span className="text-[9px] text-slate-400 font-medium tracking-tight mt-0.5">
            Document
          </span>
        </div>
      ) : isCdr ? (
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <Palette className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">
            CDR
          </span>
          <span className="text-[9px] text-slate-400 font-medium tracking-tight mt-0.5">
            CorelDRAW Vector
          </span>
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

      {/* Selection Checkbox Pill (only if selection handler or selection mode is active) */}
      {Boolean(typeof onToggleSelect === 'function' || isSelectionMode) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (typeof onToggleSelect === 'function') {
              onToggleSelect(targetMedia);
            }
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
      )}

      {/* Encrypted Badge Indicator */}
      {targetMedia.encrypted && (
        <div className="absolute top-2.5 right-2.5 p-1 rounded-md bg-black/60 backdrop-blur-sm border border-teal-500/30 text-teal-400 opacity-80 z-10" title="AES-256-GCM Encrypted">
          <Lock className="w-3 h-3" />
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  const prevItem = prevProps.media || prevProps.item || {};
  const nextItem = nextProps.media || nextProps.item || {};
  return (
    prevItem.id === nextItem.id &&
    prevItem.updated_at === nextItem.updated_at &&
    prevItem.original_filename === nextItem.original_filename &&
    prevItem.file_size === nextItem.file_size &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isSelectionMode === nextProps.isSelectionMode
  );
});
