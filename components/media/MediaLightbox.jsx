'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Info,
  Shield,
  FileText,
  HardDrive,
  Calendar,
  Loader2,
  ImageOff,
} from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';
import { formatBytes } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/context/AuthContext';
import { mediaBlobCache } from '@/lib/client-cache';

export function MediaLightbox({
  mediaList = [],
  currentIndex: initialIndex = 0,
  isOpen,
  onClose,
  onIndexChange,
  onDelete,
}) {
  const { session } = useAuth();

  // Lightbox manages its own internal index so navigation is instant
  const [internalIndex, setInternalIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [showInfo, setShowInfo] = useState(false);

  // Blob loading state for current photo
  const [photoBlobUrl, setPhotoBlobUrl] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const prevBlobRef = useRef(null);

  // Sync internal index when prop changes (e.g. user clicks different card)
  useEffect(() => {
    setInternalIndex(initialIndex);
  }, [initialIndex]);

  const currentItem = mediaList[internalIndex] || null;

  // Reset zoom when item changes
  useEffect(() => {
    setZoom(1);
    setShowInfo(false);
  }, [internalIndex]);

  // Fetch image as blob when item changes
  useEffect(() => {
    if (!isOpen || !currentItem || currentItem.media_type !== 'photo') {
      setPhotoBlobUrl(null);
      setPhotoLoading(false);
      setPhotoError(false);
      return;
    }

    // Check in-memory cache first (0ms instant preview)
    const cached = mediaBlobCache.get(currentItem.id);
    if (cached) {
      setPhotoBlobUrl(cached);
      setPhotoLoading(false);
      setPhotoError(false);
      return;
    }

    let cancelled = false;
    setPhotoLoading(true);
    setPhotoError(false);
    setPhotoBlobUrl(null);

    const tokenQuery = session?.access_token ? `?token=${encodeURIComponent(session.access_token)}` : '';
    const mediaUrl = `/api/media/${currentItem.id}/access${tokenQuery}`;

    fetch(mediaUrl, {
      headers: session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {},
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.blob();
      })
      .then((blob) => {
        if (!cancelled) {
          const objectUrl = URL.createObjectURL(blob);
          mediaBlobCache.set(currentItem.id, objectUrl);
          setPhotoBlobUrl(objectUrl);
          setPhotoLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhotoError(true);
          setPhotoLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentItem?.id, session?.access_token]);

  // Revoke blob on unmount or close
  useEffect(() => {
    return () => {
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = null;
      }
    };
  }, []);

  const goTo = useCallback((idx) => {
    if (idx >= 0 && idx < mediaList.length) {
      setInternalIndex(idx);
      if (onIndexChange) onIndexChange(idx);
    }
  }, [mediaList.length, onIndexChange]);

  const handlePrev = useCallback(() => goTo(internalIndex - 1), [internalIndex, goTo]);
  const handleNext = useCallback(() => goTo(internalIndex + 1), [internalIndex, goTo]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || !currentItem) return null;

  const tokenParam = session?.access_token ? `?token=${encodeURIComponent(session.access_token)}` : '';
  const downloadUrl = `/api/media/${currentItem.id}/download${tokenParam}`;
  const videoUrl = `/api/media/${currentItem.id}/access${tokenParam}`;

  const formattedDate = currentItem.uploaded_at
    ? new Date(currentItem.uploaded_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Unknown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md select-none animate-fade-in">
      {/* Top Action Bar */}
      <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-3 truncate max-w-md">
          <span className="text-sm font-semibold text-white truncate">
            {currentItem.original_filename}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {internalIndex + 1} / {mediaList.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls for photos */}
          {currentItem.media_type === 'photo' && (
            <div className="flex items-center gap-1 bg-slate-900/80 rounded-xl p-1 border border-slate-800 mr-2">
              <button
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
                title="Reset Zoom"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Info toggle */}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`p-2 rounded-xl transition-colors ${
              showInfo ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'text-slate-300 hover:bg-slate-800'
            }`}
            title="File details"
          >
            <Info className="w-4 h-4" />
          </button>

          {/* Download button */}
          <a
            href={downloadUrl}
            download={currentItem.original_filename}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Download original"
          >
            <Download className="w-4 h-4" />
          </a>

          {/* Delete button */}
          {onDelete && (
            <button
              onClick={() => onDelete(currentItem)}
              className="p-2 rounded-xl text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Delete item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 ml-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-12 overflow-hidden">
        {/* Navigation Previous */}
        {internalIndex > 0 && (
          <button
            onClick={handlePrev}
            className="absolute left-4 z-20 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-lg hover:scale-105 transition-all"
            aria-label="Previous file"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Content Viewer */}
        <div className="max-w-5xl max-h-[80vh] flex items-center justify-center overflow-auto">
          {currentItem.media_type === 'photo' && (
            <>
              {photoLoading && (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
                  <span className="text-sm text-slate-400">Decrypting & loading…</span>
                </div>
              )}
              {photoError && !photoLoading && (
                <div className="flex flex-col items-center gap-3">
                  <ImageOff className="w-12 h-12 text-slate-500" />
                  <span className="text-sm text-slate-400">Could not load image</span>
                </div>
              )}
              {photoBlobUrl && !photoLoading && !photoError && (
                <img
                  src={photoBlobUrl}
                  alt={currentItem.original_filename}
                  style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
                  className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl"
                />
              )}
            </>
          )}

          {currentItem.media_type === 'video' && (
            <VideoPlayer src={videoUrl} mimeType={currentItem.mime_type} autoPlay />
          )}

          {(currentItem.media_type === 'pdf' || currentItem.media_type === 'document') && (
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{currentItem.original_filename}</h3>
              <p className="text-xs text-slate-400 mb-6">
                {formatBytes(currentItem.file_size)} • {currentItem.mime_type}
              </p>
              <div className="flex items-center gap-3">
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                >
                  <span>Open in New Tab</span>
                </a>
                <a
                  href={downloadUrl}
                  download={currentItem.original_filename}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-glow-teal"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Document</span>
                </a>
              </div>
            </div>
          )}

          {(currentItem.media_type === 'archive' || currentItem.media_type === 'other') && (
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl">
              <FileText className="w-12 h-12 text-slate-400 mb-4" />
              <h3 className="text-base font-semibold text-white mb-1">{currentItem.original_filename}</h3>
              <p className="text-xs text-slate-400 mb-6 font-mono">{formatBytes(currentItem.file_size)}</p>
              <a
                href={downloadUrl}
                download={currentItem.original_filename}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950"
              >
                <Download className="w-4 h-4" />
                <span>Download File</span>
              </a>
            </div>
          )}
        </div>

        {/* Navigation Next */}
        {internalIndex < mediaList.length - 1 && (
          <button
            onClick={handleNext}
            className="absolute right-4 z-20 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-lg hover:scale-105 transition-all"
            aria-label="Next file"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Metadata Inspector Drawer */}
      {showInfo && (
        <div className="absolute right-0 inset-y-0 w-80 bg-slate-900 border-l border-slate-800 p-6 z-30 animate-slide-up flex flex-col justify-between overflow-y-auto">
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-white">File Information</h4>
              <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <span className="text-slate-400 block mb-1">Filename</span>
                <span className="text-slate-100 font-medium break-all">{currentItem.original_filename}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">File Size</span>
                <span className="text-slate-100 font-mono">{formatBytes(currentItem.file_size)}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">MIME Type</span>
                <span className="text-slate-100 font-mono">{currentItem.mime_type}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Uploaded Date & Time</span>
                <span className="text-slate-100 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-400" />
                  <span>{formattedDate}</span>
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Storage Location</span>
                <span className="text-slate-100 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{currentItem.storage_name || 'Panda Storage'} ({currentItem.storage_provider || 'Cloud'})</span>
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Security & Encryption</span>
                <Badge variant={currentItem.encrypted ? 'teal' : 'default'} size="sm">
                  {currentItem.encrypted ? 'AES-256-GCM Encrypted' : 'Standard Object Storage'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
