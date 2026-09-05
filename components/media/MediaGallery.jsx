'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Film,
  Image as ImageIcon,
  FileText,
  Archive,
  Layers,
  Search,
  Upload,
  CheckSquare,
  Download,
  Trash2,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
  Plus,
  Cloud,
  Palette,
} from 'lucide-react';
import { MediaCard } from './MediaCard';
import { MediaLightbox } from './MediaLightbox';
import { MediaGridSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StorageHowItWorksModal } from '@/components/storage/StorageHowItWorksModal';
import { useToast } from '@/components/context/ToastContext';
import { useAuth } from '@/components/context/AuthContext';
import { pandaCache } from '@/lib/client-cache';
import { useCustomEvent } from '@/hooks/useCustomEvent';
import { useDebounce } from '@/hooks/useDebounce';
import { PANDA_EVENTS, MEDIA_CATEGORIES } from '@/lib/constants/index';

const FILTER_TABS = [
  { id: MEDIA_CATEGORIES.ALL, label: 'All Files', icon: Layers },
  { id: MEDIA_CATEGORIES.PHOTO, label: 'Photos', icon: ImageIcon },
  { id: MEDIA_CATEGORIES.VIDEO, label: 'Videos', icon: Film },
  { id: MEDIA_CATEGORIES.CDR, label: 'CDR Vector', icon: Palette },
  { id: MEDIA_CATEGORIES.PDF, label: 'PDFs', icon: FileText },
  { id: MEDIA_CATEGORIES.DOCUMENT, label: 'Documents', icon: FileText },
  { id: MEDIA_CATEGORIES.ARCHIVE, label: 'Archives', icon: Archive },
];

// Granular list reconciliation helper to preserve object identities and prevent redundant re-renders
function reconcileMediaItems(prevList, incomingList) {
  if (!prevList || prevList.length === 0) return incomingList || [];
  if (!incomingList || incomingList.length === 0) return [];

  const prevMap = new Map(prevList.map((m) => [m.id, m]));

  if (prevList.length === incomingList.length) {
    let same = true;
    for (let i = 0; i < prevList.length; i++) {
      const p = prevList[i];
      const inc = incomingList[i];
      if (
        !inc ||
        p.id !== inc.id ||
        p.updated_at !== inc.updated_at ||
        p.original_filename !== inc.original_filename ||
        p.file_size !== inc.file_size
      ) {
        same = false;
        break;
      }
    }
    if (same) return prevList;
  }

  return incomingList.map((inc) => {
    const existing = prevMap.get(inc.id);
    if (
      existing &&
      existing.updated_at === inc.updated_at &&
      existing.original_filename === inc.original_filename &&
      existing.file_size === inc.file_size
    ) {
      return existing;
    }
    return inc;
  });
}

export function MediaGallery({ onOpenUpload, onOpenConnectStorage }) {
  const { session } = useAuth();
  const { success, error: toastError } = useToast();

  const cachedInitial = pandaCache.get('media:list');
  const hasValidCache = Array.isArray(cachedInitial) && cachedInitial.length > 0;

  const [mediaList, setMediaList] = useState(cachedInitial || []);
  const [hasStorage, setHasStorage] = useState(
    pandaCache.get('storage:connections')
      ? (pandaCache.get('storage:connections')?.connections || []).length > 0
      : true
  );
  // Only show skeleton on initial load if no cached data exists
  const [loading, setLoading] = useState(!hasValidCache);
  const [firstLoadDone, setFirstLoadDone] = useState(hasValidCache);
  const [activeFilter, setActiveFilter] = useState(MEDIA_CATEGORIES.ALL);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 250);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Modals state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const firstLoadDoneRef = React.useRef(hasValidCache);

  // Auth headers helper
  const getHeaders = useCallback(() => {
    const h = {};
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  // Check storage from backend API (reusing cache)
  const checkStorage = useCallback(async (force = false) => {
    if (!force) {
      const cached = pandaCache.get('storage:connections');
      if (cached) {
        const hasActiveConns = Array.isArray(cached.connections) && cached.connections.length > 0;
        setHasStorage(hasActiveConns);
        return;
      }
    }
    try {
      const headers = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/storage', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const hasActiveConns = Array.isArray(data.connections) && data.connections.length > 0;
        pandaCache.set('storage:connections', data, 120_000);
        if (data.combined) {
          pandaCache.set('storage:metrics', data.combined, 120_000);
        }
        setHasStorage(hasActiveConns);
      }
    } catch {}
  }, [session?.access_token]);

  // Fast fetch media with smart SWR caching
  const fetchContent = useCallback(
    async (opts = {}) => {
      const { sync = false, force = false, silent = false } = opts;

      // Render instantly from memory cache to avoid loading flash
      if (!force && !sync) {
        const cached = pandaCache.get('media:list');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          setMediaList((prev) => reconcileMediaItems(prev, cached));
          setLoading(false);
          firstLoadDoneRef.current = true;
          setFirstLoadDone(true);
        }
      }

      try {
        const params = new URLSearchParams();
        if (sync) params.set('sync', 'true');
        if (session?.access_token) params.set('token', session.access_token);

        const mediaUrl = `/api/media?${params.toString()}`;
        const headers = { 'Cache-Control': 'no-cache' };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

        const mediaRes = await fetch(mediaUrl, { headers, credentials: 'include' });

        if (mediaRes.ok) {
          const data = await mediaRes.json();
          const newItems = data.items || [];
          setMediaList((prev) => reconcileMediaItems(prev, newItems));
          pandaCache.set('media:list', newItems, 120_000);
        }
      } catch (err) {
        console.error('[MediaGallery] Fetch content error:', err);
      } finally {
        firstLoadDoneRef.current = true;
        setFirstLoadDone(true);
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [session?.access_token]
  );

  // Load content on mount and whenever auth token changes
  useEffect(() => {
    checkStorage(false);
    fetchContent();
  }, [session?.access_token, checkStorage, fetchContent]);

  // Silent background revalidation on window focus and tab visibility (0ms interruption, zero flicker)
  useEffect(() => {
    const handleRevalidate = () => {
      fetchContent({ silent: true });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleRevalidate();
      }
    };

    window.addEventListener('focus', handleRevalidate);
    document.addEventListener('visibilitychange', handleVisibility);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleRevalidate();
      }
    }, 10_000);

    return () => {
      window.removeEventListener('focus', handleRevalidate);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [fetchContent]);

  // Clean custom event hooks for reactive updates
  const handleMediaUploaded = useCallback((detail) => {
    if (detail?.newItems && Array.isArray(detail.newItems) && detail.newItems.length > 0) {
      const newItems = detail.newItems;
      setMediaList((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const toAdd = newItems.filter((m) => !existingIds.has(m.id));
        return [...toAdd, ...prev];
      });
    }
    pandaCache.invalidate('media:list');
    fetchContent({ silent: true, force: true });
  }, [fetchContent]);

  const handleStorageUpdated = useCallback(() => {
    pandaCache.invalidate('storage:connections');
    checkStorage(true);
  }, [checkStorage]);

  useCustomEvent(PANDA_EVENTS.MEDIA_UPLOADED, handleMediaUploaded);
  useCustomEvent(PANDA_EVENTS.STORAGE_UPDATED, handleStorageUpdated);

  // Explicit cloud storage sync handler (non-blocking, zero screen flicker, zero media wipe)
  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      pandaCache.invalidate('media:list');
      pandaCache.invalidate('storage:connections');
      pandaCache.invalidate('storage:metrics');
      await fetchContent({ sync: true, force: true, silent: true });
      await checkStorage(true);
      window.dispatchEvent(new CustomEvent(PANDA_EVENTS.STORAGE_UPDATED));
      success('Cloud storage synchronized.');
    } catch (err) {
      console.error('[MediaGallery] Sync error:', err);
      toastError('Failed to synchronize cloud storage.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Category count calculation for live badge indicators
  const categoryCounts = useMemo(() => {
    const counts = { [MEDIA_CATEGORIES.ALL]: mediaList.length };
    mediaList.forEach((item) => {
      const type = (item.media_type || item.mediaType || '').toLowerCase();
      const mime = (item.mime_type || item.mimeType || item.content_type || '').toLowerCase();
      const name = (item.original_filename || item.filename || item.name || '').toLowerCase();
      const ext = name.split('.').pop() || '';

      if (
        type === 'photo' ||
        type === 'image' ||
        mime.startsWith('image/') ||
        ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'ico', 'tiff', 'tif'].includes(ext)
      ) {
        counts[MEDIA_CATEGORIES.PHOTO] = (counts[MEDIA_CATEGORIES.PHOTO] || 0) + 1;
      } else if (
        type === 'video' ||
        mime.startsWith('video/') ||
        ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', '3gp', 'flv', 'wmv'].includes(ext)
      ) {
        counts[MEDIA_CATEGORIES.VIDEO] = (counts[MEDIA_CATEGORIES.VIDEO] || 0) + 1;
      } else if (
        type === 'cdr' ||
        ext === 'cdr' ||
        mime.includes('coreldraw') ||
        mime.includes('x-cdr') ||
        mime.includes('cdr')
      ) {
        counts[MEDIA_CATEGORIES.CDR] = (counts[MEDIA_CATEGORIES.CDR] || 0) + 1;
      } else if (
        type === 'pdf' ||
        ext === 'pdf' ||
        mime.includes('pdf')
      ) {
        counts[MEDIA_CATEGORIES.PDF] = (counts[MEDIA_CATEGORIES.PDF] || 0) + 1;
      } else if (
        type === 'archive' ||
        ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext) ||
        mime.includes('zip') ||
        mime.includes('tar') ||
        mime.includes('compressed') ||
        mime.includes('archive')
      ) {
        counts[MEDIA_CATEGORIES.ARCHIVE] = (counts[MEDIA_CATEGORIES.ARCHIVE] || 0) + 1;
      } else if (
        type === 'audio' ||
        mime.startsWith('audio/') ||
        ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma'].includes(ext)
      ) {
        counts[MEDIA_CATEGORIES.AUDIO] = (counts[MEDIA_CATEGORIES.AUDIO] || 0) + 1;
      } else {
        counts[MEDIA_CATEGORIES.DOCUMENT] = (counts[MEDIA_CATEGORIES.DOCUMENT] || 0) + 1;
      }
    });
    return counts;
  }, [mediaList]);

  // Instant 0ms client-side filtering and search
  const filteredMedia = useMemo(() => {
    let list = mediaList;
    if (activeFilter && activeFilter !== MEDIA_CATEGORIES.ALL && activeFilter !== 'all') {
      list = list.filter((item) => {
        const type = (item.media_type || item.mediaType || '').toLowerCase();
        const mime = (item.mime_type || item.mimeType || item.content_type || '').toLowerCase();
        const name = (item.original_filename || item.filename || item.name || '').toLowerCase();
        const ext = name.split('.').pop() || '';

        if (
          activeFilter === MEDIA_CATEGORIES.PHOTO ||
          activeFilter === 'photo' ||
          activeFilter === 'photos' ||
          activeFilter === 'image' ||
          activeFilter === 'images'
        ) {
          return (
            type === 'photo' ||
            type === 'image' ||
            mime.startsWith('image/') ||
            ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'ico', 'tiff', 'tif'].includes(ext)
          );
        }

        if (
          activeFilter === MEDIA_CATEGORIES.VIDEO ||
          activeFilter === 'video' ||
          activeFilter === 'videos'
        ) {
          return (
            type === 'video' ||
            mime.startsWith('video/') ||
            ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', '3gp', 'flv', 'wmv'].includes(ext)
          );
        }

        if (
          activeFilter === MEDIA_CATEGORIES.CDR ||
          activeFilter === 'cdr'
        ) {
          return (
            type === 'cdr' ||
            ext === 'cdr' ||
            mime.includes('coreldraw') ||
            mime.includes('x-cdr') ||
            mime.includes('cdr')
          );
        }

        if (
          activeFilter === MEDIA_CATEGORIES.PDF ||
          activeFilter === 'pdf' ||
          activeFilter === 'pdfs'
        ) {
          return (
            type === 'pdf' ||
            ext === 'pdf' ||
            mime.includes('pdf')
          );
        }

        if (
          activeFilter === MEDIA_CATEGORIES.DOCUMENT ||
          activeFilter === 'document' ||
          activeFilter === 'documents'
        ) {
          return (
            type === 'document' ||
            ['doc', 'docx', 'txt', 'rtf', 'odt', 'ods', 'xlsx', 'xls', 'csv', 'pptx', 'ppt', 'md', 'json', 'xml'].includes(ext) ||
            mime.includes('word') ||
            mime.includes('text') ||
            mime.includes('document') ||
            mime.includes('sheet') ||
            mime.includes('presentation')
          );
        }

        if (
          activeFilter === MEDIA_CATEGORIES.ARCHIVE ||
          activeFilter === 'archive' ||
          activeFilter === 'archives'
        ) {
          return (
            type === 'archive' ||
            ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext) ||
            mime.includes('zip') ||
            mime.includes('tar') ||
            mime.includes('compressed') ||
            mime.includes('archive')
          );
        }

        if (
          activeFilter === MEDIA_CATEGORIES.AUDIO ||
          activeFilter === 'audio'
        ) {
          return (
            type === 'audio' ||
            mime.startsWith('audio/') ||
            ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma'].includes(ext)
          );
        }

        return type === activeFilter;
      });
    }

    if (debouncedSearch && debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      list = list.filter((item) => {
        const name = (item.original_filename || item.filename || item.name || '').toLowerCase();
        return name.includes(q);
      });
    }

    return list;
  }, [mediaList, activeFilter, debouncedSearch]);

  // Date grouping utility based on filteredMedia
  const groupedMedia = useMemo(() => {
    const groups = {};

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfToday.getDate() - 1);

    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfToday.getDate() + 1);

    filteredMedia.forEach((item) => {
      const rawDate = item.uploaded_at || item.created_at || item.uploadedAt || item.createdAt;
      const dateObj = new Date(rawDate);
      if (isNaN(dateObj.getTime())) {
        if (!groups['Earlier']) groups['Earlier'] = [];
        groups['Earlier'].push(item);
        return;
      }

      let label = '';
      if (dateObj >= startOfToday && dateObj < startOfTomorrow) {
        label = 'Today';
      } else if (dateObj >= startOfYesterday && dateObj < startOfToday) {
        label = 'Yesterday';
      } else {
        label = dateObj.toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
      }

      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });

    return groups;
  }, [filteredMedia]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredMedia.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMedia.map((m) => m.id)));
    }
  };

  const handleOpenLightbox = (item) => {
    const idx = filteredMedia.findIndex((m) => m.id === item.id);
    if (idx !== -1) {
      setLightboxIndex(idx);
      setLightboxOpen(true);
    }
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    setLightboxOpen(false);
    try {
      if (deleteTarget === 'bulk') {
        const ids = Array.from(selectedIds);
        const idSet = new Set(ids);

        // 1. Optimistically remove from UI immediately
        setMediaList((prev) => prev.filter((m) => !idSet.has(m.id)));

        // 2. Clear from memory cache
        for (const id of ids) {
          pandaCache.removeMediaItem(id);
        }
        pandaCache.invalidate('storage:metrics');
        pandaCache.invalidate('storage:connections');
        pandaCache.invalidate('media:list');

        // 3. Perform background deletes
        for (const id of ids) {
          await fetch(`/api/media/${id}`, { method: 'DELETE', headers: getHeaders(), credentials: 'include' });
        }
        success(`Deleted ${ids.length} files successfully.`);
        setSelectedIds(new Set());
        setIsSelectionMode(false);
      } else if (deleteTarget?.id) {
        const delId = deleteTarget.id;

        // 1. Optimistically remove from UI immediately
        setMediaList((prev) => prev.filter((m) => m.id !== delId));

        // 2. Clear from memory cache
        pandaCache.removeMediaItem(delId);
        pandaCache.invalidate('storage:metrics');
        pandaCache.invalidate('storage:connections');
        pandaCache.invalidate('media:list');

        // 3. Perform background delete
        const res = await fetch(`/api/media/${delId}`, { method: 'DELETE', headers: getHeaders(), credentials: 'include' });
        if (res.ok) {
          success(`Deleted "${deleteTarget.original_filename}"`);
        } else {
          toastError('Failed to delete file');
        }
      }
      setDeleteTarget(null);
      fetchContent({ silent: true, force: true });
      window.dispatchEvent(new CustomEvent(PANDA_EVENTS.STORAGE_UPDATED));
    } catch {
      toastError('Network error deleting files');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDownload = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      window.open(`/api/media/${id}/download`, '_blank');
    }
  };

  const handleUploadClick = () => {
    if (!hasStorage) {
      if (onOpenConnectStorage) onOpenConnectStorage();
    } else if (onOpenUpload) {
      onOpenUpload();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Search Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFilter === tab.id;
            const count = categoryCounts[tab.id] || 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-teal-500 text-slate-950 shadow-glow-teal'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full leading-tight ${
                      isActive ? 'bg-slate-950/20 text-slate-950 font-bold' : 'bg-slate-800/80 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search library..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          {hasStorage && (
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              isLoading={isSyncing}
              onClick={handleSync}
              title="Synchronize all files from cloud storage buckets"
            >
              {isSyncing ? 'Syncing...' : 'Sync'}
            </Button>
          )}

          {filteredMedia.length > 0 && (
            <Button
              variant={isSelectionMode ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                setIsSelectionMode(!isSelectionMode);
                if (isSelectionMode) setSelectedIds(new Set());
              }}
            >
              {isSelectionMode ? 'Done' : 'Select'}
            </Button>
          )}

          <Button variant="primary" size="sm" icon={Upload} onClick={handleUploadClick}>
            Upload Media
          </Button>
        </div>
      </div>

      {/* Syncing Live Indicator Banner */}
      {isSyncing && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-medium animate-pulse">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400 shrink-0" />
            <span>Syncing library with connected cloud storage...</span>
          </div>
          <span className="text-[11px] text-teal-400/70 font-mono">Reconciling bucket</span>
        </div>
      )}

      {/* Bulk Action Sticky Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-20 z-10 flex items-center justify-between p-3.5 rounded-2xl bg-teal-950/90 border border-teal-500/40 backdrop-blur-md shadow-modal animate-slide-up">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="flex items-center gap-2 text-xs font-semibold text-teal-300 hover:text-white"
            >
              <CheckSquare className="w-4 h-4" />
              <span>
                {selectedIds.size === filteredMedia.length ? 'Deselect All' : 'Select All'} ({selectedIds.size})
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={handleBulkDownload}
            >
              Download
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              onClick={() => setDeleteTarget('bulk')}
            >
              Delete ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* Main Gallery View / Onboarding View */}
      {loading || (!firstLoadDone && mediaList.length === 0) ? (
        <MediaGridSkeleton count={12} />
      ) : !hasStorage && mediaList.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-card space-y-6 animate-slide-up">
          <div className="w-16 h-16 rounded-3xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400">
            <Cloud className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Your media library is ready when you are.
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
              Connect your own cloud storage (Cloudflare R2, Backblaze B2, or Amazon S3) to upload photos, videos, PDFs, and documents.
              Your files stay in <strong className="text-slate-200">YOUR</strong> storage; Panda only stores encrypted metadata to organize your library.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={onOpenConnectStorage}
            >
              Connect Cloud Storage
            </Button>

            <Button
              variant="secondary"
              size="md"
              icon={HelpCircle}
              onClick={() => setHowItWorksOpen(true)}
            >
              How does this work?
            </Button>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-500 font-mono">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>Zero-Knowledge • AES-256-GCM Encrypted Storage</span>
          </div>
        </div>
      ) : mediaList.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-card space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white">No media files yet</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Upload photos, videos, vector files, PDFs, or documents to store in your connected cloud storage.
            </p>
          </div>
          <div className="pt-2 flex justify-center">
            <Button variant="primary" size="sm" icon={Upload} onClick={handleUploadClick}>
              Upload File
            </Button>
          </div>
        </div>
      ) : filteredMedia.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-card space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white">No matching files found</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {searchInput
                ? `No items found matching "${searchInput}".`
                : `No ${activeFilter} found in your library.`}
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveFilter(MEDIA_CATEGORIES.ALL);
                setSearchInput('');
              }}
            >
              Show All Media
            </Button>
            <Button variant="primary" size="sm" icon={Upload} onClick={handleUploadClick}>
              Upload File
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedMedia).map(([dateLabel, items]) => (
            <div key={dateLabel} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {dateLabel}
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  ({items.length} {items.length === 1 ? 'file' : 'files'})
                </span>
                <div className="flex-1 border-t border-slate-800/80" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                {items.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    isSelected={selectedIds.has(item.id)}
                    isSelectionMode={isSelectionMode}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onClick={() => {
                      if (isSelectionMode) toggleSelect(item.id);
                      else handleOpenLightbox(item);
                    }}
                    onDelete={(target) => setDeleteTarget(target)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      <MediaLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        mediaList={filteredMedia}
        currentIndex={lightboxIndex}
        onIndexChange={(idx) => setLightboxIndex(idx)}
        onDelete={(item) => setDeleteTarget(item)}
      />

      {/* How It Works Modal */}
      <StorageHowItWorksModal
        isOpen={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
        onConnect={() => {
          setHowItWorksOpen(false);
          if (onOpenConnectStorage) onOpenConnectStorage();
        }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={deleteTarget === 'bulk' ? `Delete ${selectedIds.size} files?` : 'Delete media file?'}
        message="This will permanently delete the encrypted file from your cloud object storage. This action cannot be undone."
        confirmText="Delete permanently"
        confirmVariant="danger"
        isLoading={isDeleting}
        onConfirm={executeDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
