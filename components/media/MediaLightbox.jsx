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
  ExternalLink,
} from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';
import { formatBytes } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/context/AuthContext';

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

  const [photoLoading, setPhotoLoading] = useState(true);
  const [photoError, setPhotoError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const imgRef = useRef(null);

  // Sync internal index when prop changes
  useEffect(() => {
    setInternalIndex(initialIndex);
  }, [initialIndex]);

  const currentItem = mediaList[internalIndex] || null;

  const targetMedia = currentItem || {};
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

  const tokenParam = session?.access_token ? `token=${encodeURIComponent(session.access_token)}` : '';
  const retryParam = retryKey > 0 ? `r=${retryKey}` : '';
  const queryParts = [tokenParam, retryParam].filter(Boolean);
  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const accessUrl = currentItem?.id ? `/api/media/${currentItem.id}/access${queryString}` : '';
  const downloadUrl = currentItem?.id ? `/api/media/${currentItem.id}/download${session?.access_token ? `?token=${encodeURIComponent(session.access_token)}` : ''}` : '';

  // Reset zoom & loading states when item changes
  useEffect(() => {
    setZoom(1);
    setShowInfo(false);
    setPhotoError(null);
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setPhotoLoading(false);
    } else {
      setPhotoLoading(true);
    }
  }, [internalIndex, currentItem?.id, accessUrl]);

  const handleImageLoad = useCallback(() => {
    setPhotoLoading(false);
    setPhotoError(null);
  }, []);

  const handleImageError = useCallback(() => {
    setPhotoLoading(false);
    setPhotoError('Image data could not be loaded from storage.');
  }, []);

  const setImgRefCallback = useCallback((node) => {
    imgRef.current = node;
    if (node && node.complete) {
      if (node.naturalWidth > 0) {
        setPhotoLoading(false);
        setPhotoError(null);
      } else if (node.currentSrc || node.src) {
        setPhotoLoading(false);
        setPhotoError('Image data could not be loaded from storage.');
      }
    }
  }, []);

  const handleRetry = useCallback((e) => {
    e?.stopPropagation();
    setPhotoError(null);
    setPhotoLoading(true);
    setRetryKey((prev) => prev + 1);
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

  const formattedDate = currentItem.uploaded_at
    ? new Date(currentItem.uploaded_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Unknown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md select-none animate-fade-in">
      {/* Top Action Bar */}
      <div className="absolute top-0 inset-x-0 h-14 sm:h-16 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between px-3 sm:px-6 z-20">
        <div className="flex items-center gap-2 sm:gap-3 truncate max-w-[140px] xs:max-w-[220px] sm:max-w-md">
          <span className="text-xs sm:text-sm font-semibold text-white truncate">
            {rawFilename || 'Media File'}
          </span>
          <span className="text-[10px] sm:text-xs text-slate-400 font-mono shrink-0">
            {internalIndex + 1} / {mediaList.length}
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Zoom controls for photos */}
          {isPhoto && (
            <div className="hidden sm:flex items-center gap-1 bg-slate-900/80 rounded-xl p-1 border border-slate-800 mr-1 sm:mr-2">
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
            className={`p-1.5 sm:p-2 rounded-xl transition-colors ${
              showInfo ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'text-slate-300 hover:bg-slate-800'
            }`}
            title="File details"
          >
            <Info className="w-4 h-4" />
          </button>

          {/* Download button */}
          <a
            href={downloadUrl}
            download={rawFilename}
            className="p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Download original"
          >
            <Download className="w-4 h-4" />
          </a>

          {/* Delete button */}
          {onDelete && (
            <button
              onClick={() => onDelete(currentItem)}
              className="p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Delete item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 ml-1 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-8 overflow-hidden">
        {/* Navigation Previous */}
        {internalIndex > 0 && (
          <button
            onClick={handlePrev}
            className="absolute left-2 sm:left-4 z-20 p-2 sm:p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-lg hover:scale-105 transition-all"
            aria-label="Previous file"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* Content Viewer */}
        <div className="w-full h-full flex items-center justify-center overflow-auto p-1 sm:p-2">
          {isPhoto && (
            <div className="relative flex items-center justify-center max-w-full max-h-full">
              {photoLoading && !photoError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none">
                  <div className="flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl bg-slate-900/80 backdrop-blur-sm border border-slate-800 shadow-xl">
                    <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
                    <span className="text-xs text-slate-300 font-mono">Loading image…</span>
                  </div>
                </div>
              )}

              {photoError ? (
                <div className="flex flex-col items-center gap-4 max-w-sm text-center p-6 sm:p-8 bg-slate-900/90 rounded-3xl border border-slate-800 shadow-card">
                  <ImageOff className="w-12 h-12 text-slate-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-200 mb-1">Could not render image</p>
                    <p className="text-xs text-slate-400 font-mono break-all">{photoError}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRetry}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 hover:border-teal-400/50 transition-colors"
                    >
                      Retry
                    </button>
                    <a
                      href={accessUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <span>Open link</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <img
                  ref={setImgRefCallback}
                  key={accessUrl}
                  src={accessUrl}
                  alt={rawFilename || 'Photo'}
                  style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
                  className={`max-h-[82vh] max-w-[95vw] sm:max-w-[90vw] object-contain rounded-xl sm:rounded-2xl shadow-2xl transition-opacity duration-200 ${
                    photoLoading ? 'opacity-0' : 'opacity-100'
                  }`}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              )}
            </div>
          )}

          {isVideo && (
            <VideoPlayer src={accessUrl} mimeType={currentItem.mime_type} autoPlay />
          )}

          {isPdf && (
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center shadow-2xl animate-fade-in mx-2">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-white mb-2 max-w-md truncate">{rawFilename}</h3>
              <p className="text-xs text-slate-400 mb-6 font-mono">
                {formatBytes(currentItem.file_size)} • PDF Document
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <a
                  href={accessUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-red-500 hover:bg-red-400 text-white font-bold transition-all w-full sm:w-auto justify-center"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open PDF in Tab</span>
                </a>
                <a
                  href={downloadUrl}
                  download={rawFilename}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all border border-slate-700 w-full sm:w-auto justify-center"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Next */}
        {internalIndex < mediaList.length - 1 && (
          <button
            onClick={handleNext}
            className="absolute right-2 sm:right-4 z-20 p-2 sm:p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-lg hover:scale-105 transition-all"
            aria-label="Next file"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}
      </div>

      {/* Info Sidebar Panel */}
      {showInfo && (
        <div className="absolute right-0 top-14 sm:top-16 bottom-0 w-full sm:w-80 bg-slate-900/98 border-l border-slate-800 p-5 sm:p-6 z-20 backdrop-blur-md overflow-y-auto animate-slide-left space-y-5 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h4 className="font-semibold text-white text-sm">File Details</h4>
            <button
              onClick={() => setShowInfo(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <span className="text-slate-500 block mb-1 text-[11px] uppercase tracking-wider font-semibold">File Name</span>
              <p className="text-slate-200 font-mono break-all bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                {rawFilename}
              </p>
            </div>

            <div>
              <span className="text-slate-500 block mb-1 text-[11px] uppercase tracking-wider font-semibold">Size</span>
              <p className="text-slate-200 font-mono">
                {formatBytes(currentItem.file_size)}
              </p>
            </div>

            <div>
              <span className="text-slate-500 block mb-1 text-[11px] uppercase tracking-wider font-semibold">Content Type</span>
              <p className="text-slate-200 font-mono">
                {currentItem.mime_type || 'Unknown'}
              </p>
            </div>

            <div>
              <span className="text-slate-500 block mb-1 text-[11px] uppercase tracking-wider font-semibold">Uploaded Date</span>
              <p className="text-slate-200 font-mono">
                {formattedDate}
              </p>
            </div>

            <div>
              <span className="text-slate-500 block mb-1 text-[11px] uppercase tracking-wider font-semibold">Security</span>
              <div className="flex items-center gap-1.5 text-teal-400 font-semibold mt-1">
                <Shield className="w-4 h-4" />
                <span>AES-256-GCM Encrypted</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
