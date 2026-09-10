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
  Archive,
  RefreshCw,
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

  const isArchive =
    type === 'archive' ||
    Boolean(filename.match(/\.(zip|rar|7z|tar|gz|bz2)(\.enc)?$/i));

  const isPhoto =
    !isVideo &&
    !isPdf &&
    !isArchive &&
    (type === 'photo' ||
      type === 'image' ||
      mime.startsWith('image/') ||
      Boolean(filename.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp|heic|avif|ico|tiff)(\.enc)?$/i)));

  const tokenParam = session?.access_token ? `?token=${encodeURIComponent(session.access_token)}` : '';
  const accessUrl = targetMedia.id ? `/api/media/${targetMedia.id}/access${tokenParam}` : '';
  const downloadUrl = targetMedia.id ? `/api/media/${targetMedia.id}/download${tokenParam}` : '';

  const [blobUrl, setBlobUrl] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  // Direct access URL with retry query if retrying
  const effectiveImageUrl = accessUrl ? `${accessUrl}${retryKey > 0 ? `&r=${retryKey}` : ''}` : '';

  const handleRetry = (e) => {
    e?.stopPropagation();
    setImgError(false);
    setErrorMsg('');
    setImgLoaded(false);
    setRetryKey((prev) => prev + 1);
  };

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
      {isPhoto ? (
        imgError ? (
          <div className="flex flex-col items-center justify-center p-3 text-center gap-1.5 bg-slate-950/60 w-full h-full">
            <ImageOff className="w-5 h-5 text-slate-500" />
            <span className="text-[10px] text-slate-400 font-mono leading-tight truncate max-w-[90%]">
              {rawFilename || 'Image'}
            </span>
            <button
              onClick={handleRetry}
              className="text-[10px] text-teal-400 hover:text-teal-300 font-semibold px-2 py-0.5 rounded-lg border border-teal-500/30 hover:border-teal-400/50 transition-colors mt-1"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="relative w-full h-full">
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40">
                <div className="w-4 h-4 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
              </div>
            )}
            <img
              ref={(node) => {
                if (node && node.complete && node.naturalWidth > 0 && !imgLoaded) {
                  setImgLoaded(true);
                  setImgError(false);
                }
              }}
              key={effectiveImageUrl}
              src={effectiveImageUrl}
              alt={rawFilename || 'Media'}
              loading="lazy"
              onLoad={() => {
                setImgLoaded(true);
                setImgError(false);
              }}
              onError={() => {
                setImgError(true);
                setImgLoaded(false);
              }}
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>
        )
      ) : isVideo ? (
        <div className="relative w-full h-full flex items-center justify-center bg-black group">
          <video
            src={effectiveImageUrl}
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
      ) : isPdf ? (
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <FileText className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-mono font-semibold text-slate-300 uppercase tracking-wider">PDF</span>
        </div>
      ) : isArchive ? (
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <Archive className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-mono font-semibold text-purple-300 uppercase tracking-wider">Archive</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <File className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
            {filename.split('.').pop()?.replace(/enc$/, '') || 'FILE'}
          </span>
        </div>
      )}

      {/* Selection Dot Checkbox Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (typeof onToggleSelect === 'function') {
            onToggleSelect(targetMedia);
          }
        }}
        aria-label={isSelected ? 'Deselect file' : 'Select file'}
        className={`absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-20 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150 cursor-pointer ${
          isSelected
            ? 'opacity-100 border-teal-400 bg-slate-950 shadow-glow-teal scale-110'
            : isSelectionMode
            ? 'opacity-100 border-white/80 bg-black/50 backdrop-blur-xs hover:border-teal-400 hover:scale-110'
            : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100 border-white/70 bg-black/40 backdrop-blur-xs hover:border-teal-400 hover:scale-110'
        }`}
      >
        {isSelected && (
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-scale-in" />
        )}
      </button>

      {/* Hover / Active Info Overlay */}
      <div className="absolute inset-x-0 bottom-0 p-2 sm:p-2.5 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end pointer-events-none">
        <p className="text-[11px] sm:text-xs font-semibold text-slate-100 truncate">{rawFilename || 'Media File'}</p>
        <div className="flex items-center justify-between mt-0.5 text-[9px] sm:text-[10px] text-slate-400 font-mono">
          <span>{formatBytes(targetMedia.file_size || targetMedia.size_bytes || 0)}</span>
          {targetMedia.encrypted !== false && (
            <span className="flex items-center gap-1 text-teal-400/80">
              <Lock className="w-2.5 h-2.5" />
              <span>AES-256</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
