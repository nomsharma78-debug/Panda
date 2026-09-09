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
  Check,
  X,
  Download,
  Trash2,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
  Plus,
  Cloud,
  FolderPlus,
  Folder,
  FolderOpen,
  ArrowLeft,
  MoreVertical,
  SlidersHorizontal,
  ArrowUpDown,
  Calendar,
  CalendarDays,
  HardDrive,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { MediaCard } from './MediaCard';
import { MediaLightbox } from './MediaLightbox';
import { CreateFolderModal } from './CreateFolderModal';
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
  { id: MEDIA_CATEGORIES.PDF, label: 'PDFs', icon: FileText },
  { id: MEDIA_CATEGORIES.DOCUMENT, label: 'Documents', icon: FileText },
  { id: MEDIA_CATEGORIES.ARCHIVE, label: 'Archives', icon: Archive },
];

const MONTH_NAMES = [
  { id: 'all', label: 'All Months', short: 'All' },
  { id: '0', label: 'January', short: 'Jan' },
  { id: '1', label: 'February', short: 'Feb' },
  { id: '2', label: 'March', short: 'Mar' },
  { id: '3', label: 'April', short: 'Apr' },
  { id: '4', label: 'May', short: 'May' },
  { id: '5', label: 'June', short: 'Jun' },
  { id: '6', label: 'July', short: 'Jul' },
  { id: '7', label: 'August', short: 'Aug' },
  { id: '8', label: 'September', short: 'Sep' },
  { id: '9', label: 'October', short: 'Oct' },
  { id: '10', label: 'November', short: 'Nov' },
  { id: '11', label: 'December', short: 'Dec' },
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

// ── Folder colour palette ──────────
const FOLDER_COLOR_CLASSES = {
  teal:    { icon: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/30',    dot: 'bg-teal-400',    glow: 'hover:border-teal-500/60' },
  violet:  { icon: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  dot: 'bg-violet-400',  glow: 'hover:border-violet-500/60' },
  amber:   { icon: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-400',   glow: 'hover:border-amber-500/60' },
  rose:    { icon: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    dot: 'bg-rose-400',    glow: 'hover:border-rose-500/60' },
  sky:     { icon: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     dot: 'bg-sky-400',     glow: 'hover:border-sky-500/60' },
  emerald: { icon: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400', glow: 'hover:border-emerald-500/60' },
  orange:  { icon: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  dot: 'bg-orange-400',  glow: 'hover:border-orange-500/60' },
  slate:   { icon: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   dot: 'bg-slate-400',   glow: 'hover:border-slate-500/60' },
};

function FolderCard({ folder, onClick, onDelete, liveFileCount }) {
  const c = FOLDER_COLOR_CLASSES[folder.color] || FOLDER_COLOR_CLASSES.teal;
  const fileCount = liveFileCount !== undefined ? liveFileCount : (folder.file_count ?? 0);

  return (
    <div
      onClick={() => onClick?.(folder)}
      className={`group relative flex flex-col justify-between p-4 rounded-3xl border bg-slate-900/90 ${c.border} ${c.glow} hover:bg-slate-850 hover:shadow-xl cursor-pointer transition-all duration-200 select-none hover:scale-[1.02] active:scale-[0.99]`}
    >
      {/* Top row: Icon + color dot + delete option */}
      <div className="flex items-center justify-between w-full">
        <div className={`w-11 h-11 rounded-2xl ${c.bg} ${c.border} border flex items-center justify-center transition-transform group-hover:scale-110`}>
          <Folder className={`w-5 h-5 ${c.icon} fill-current opacity-80 group-hover:opacity-100 transition-opacity`} />
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${c.dot} opacity-80`} />
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(folder);
              }}
              title="Delete folder"
              className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Name + count */}
      <div className="min-w-0 mt-3">
        <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate leading-tight group-hover:text-white">
          {folder.name}
        </p>
        <p className="text-[11px] text-slate-400 font-mono mt-1 flex items-center gap-1">
          <span>{fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
        </p>
      </div>
    </div>
  );
}

function FolderGrid({ folders, onFolderClick, onDeleteFolder, folderCounts = {} }) {
  if (!folders || folders.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-teal-400" />
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Folders</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800">
          {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
        </span>
        <div className="flex-1 border-t border-slate-800/80" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            liveFileCount={folderCounts[folder.id]}
            onClick={onFolderClick}
            onDelete={onDeleteFolder}
          />
        ))}
      </div>
    </div>
  );
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
  const [loading, setLoading] = useState(!hasValidCache);
  const [firstLoadDone, setFirstLoadDone] = useState(hasValidCache);
  const [activeFilter, setActiveFilter] = useState(MEDIA_CATEGORIES.ALL);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 250);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const isSelectionMode = selectedIds.size > 0;

  // Sorting & Grouping state
  const [sortBy, setSortBy] = useState('date-desc');
  const [groupBy, setGroupBy] = useState('date');
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = React.useRef(null);

  // Available unique years extracted from loaded media
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    mediaList.forEach((item) => {
      const rawDate = item.uploaded_at || item.created_at || item.uploadedAt || item.createdAt;
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        yearsSet.add(d.getFullYear().toString());
      }
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [mediaList]);

  // Close sort dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) {
        setSortMenuOpen(false);
      }
    };
    if (sortMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sortMenuOpen]);

  // Folder state
  const [folderList, setFolderList] = useState([]);
  const [openFolder, setOpenFolder] = useState(null);

  // Modals state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  const firstLoadDoneRef = React.useRef(hasValidCache);

  // Auth headers helper
  const getHeaders = useCallback(() => {
    const h = {};
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  // Check storage from backend API
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

  // Fast fetch media
  const fetchContent = useCallback(
    async (opts = {}) => {
      const { sync = false, force = false, silent = false } = opts;

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

  // Fetch folders from API
  const fetchFolders = useCallback(
    async (silent = false) => {
      try {
        const headers = { 'Cache-Control': 'no-cache' };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        const res = await fetch('/api/media/folders', { headers, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setFolderList(data.folders || []);
        }
      } catch (err) {
        if (!silent) console.warn('[MediaGallery] fetchFolders error:', err);
      }
    },
    [session?.access_token]
  );

  // Load content on mount
  useEffect(() => {
    checkStorage(false);
    fetchContent();
    fetchFolders();
  }, [session?.access_token, checkStorage, fetchContent, fetchFolders]);

  // Silent background revalidation
  useEffect(() => {
    const handleRevalidate = () => {
      fetchContent({ silent: true });
      fetchFolders(true);
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
    }, 15_000);

    return () => {
      window.removeEventListener('focus', handleRevalidate);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [fetchContent, fetchFolders]);

  // Custom event handlers
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
    fetchFolders(true);
  }, [fetchContent, fetchFolders]);

  const handleStorageUpdated = useCallback(() => {
    pandaCache.invalidate('storage:connections');
    checkStorage(true);
  }, [checkStorage]);

  useCustomEvent(PANDA_EVENTS.MEDIA_UPLOADED, handleMediaUploaded);
  useCustomEvent(PANDA_EVENTS.STORAGE_UPDATED, handleStorageUpdated);

  // Explicit cloud storage sync handler
  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      pandaCache.invalidate('media:list');
      pandaCache.invalidate('storage:connections');
      pandaCache.invalidate('storage:metrics');
      await Promise.all([
        fetchContent({ sync: true, force: true, silent: true }),
        fetchFolders(true),
        checkStorage(true),
      ]);
      window.dispatchEvent(new CustomEvent(PANDA_EVENTS.STORAGE_UPDATED));
      success('Cloud storage synchronized.');
    } catch (err) {
      console.error('[MediaGallery] Sync error:', err);
      toastError('Failed to synchronize cloud storage.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Delete folder execution
  const executeDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    setIsDeletingFolder(true);
    try {
      const res = await fetch(`/api/media/folders/${deleteFolderTarget.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        setFolderList((prev) => prev.filter((f) => f.id !== deleteFolderTarget.id));
        if (openFolder?.id === deleteFolderTarget.id) {
          setOpenFolder(null);
        }
        success(`Folder "${deleteFolderTarget.name}" deleted.`);
        fetchContent({ silent: true, force: true });
      } else {
        toastError('Failed to delete folder.');
      }
    } catch {
      toastError('Network error deleting folder.');
    } finally {
      setIsDeletingFolder(false);
      setDeleteFolderTarget(null);
    }
  };

// Helper to check if an item belongs to a specific folder
function isItemInSpecificFolder(item, folder) {
  if (!folder) return false;
  if (item.folder_id && item.folder_id === folder.id) return true;
  const key = item.object_key || item.storage_object_key || '';
  const cleanKey = key.replace(/^media\//, '');
  const parts = cleanKey.split('/');
  if (parts.length > 1 && parts[0].toLowerCase().trim() === folder.name?.toLowerCase().trim()) return true;
  return false;
}

// Helper to check if an item belongs to any existing folder
function isItemInAnyFolder(item, folders = []) {
  if (item.folder_id) return true;
  const key = item.object_key || item.storage_object_key || '';
  const cleanKey = key.replace(/^media\//, '');
  const parts = cleanKey.split('/');
  if (parts.length > 1 && folders.some((f) => f.name && f.name.toLowerCase().trim() === parts[0].toLowerCase().trim())) {
    return true;
  }
  return false;
}

  // Calculate live per-folder counts from mediaList
  const folderCounts = useMemo(() => {
    const counts = {};
    for (const f of folderList) {
      counts[f.id] = mediaList.filter((item) => isItemInSpecificFolder(item, f)).length;
    }
    return counts;
  }, [mediaList, folderList]);

  // Calculate category counts for live badge indicators
  const categoryCounts = useMemo(() => {
    let baseList = mediaList;
    if (openFolder) {
      baseList = mediaList.filter((item) => isItemInSpecificFolder(item, openFolder));
    } else {
      baseList = mediaList.filter((item) => !isItemInAnyFolder(item, folderList));
    }

    const counts = { [MEDIA_CATEGORIES.ALL]: baseList.length };
    baseList.forEach((item) => {
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
  }, [mediaList, openFolder, folderList]);

  // Filtered media based on active folder, category filter, and search
  const filteredMedia = useMemo(() => {
    let list = mediaList;

    // Filter by open folder if one is selected, or exclude folder files at root level
    if (openFolder) {
      list = list.filter((item) => isItemInSpecificFolder(item, openFolder));
    } else {
      list = list.filter((item) => !isItemInAnyFolder(item, folderList));
    }

    // Filter by active category
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

    // Filter by selected year
    if (filterYear && filterYear !== 'all') {
      list = list.filter((item) => {
        const rawDate = item.uploaded_at || item.created_at || item.uploadedAt || item.createdAt;
        const d = new Date(rawDate);
        if (isNaN(d.getTime())) return false;
        return d.getFullYear().toString() === filterYear;
      });
    }

    // Filter by selected month
    if (filterMonth && filterMonth !== 'all') {
      list = list.filter((item) => {
        const rawDate = item.uploaded_at || item.created_at || item.uploadedAt || item.createdAt;
        const d = new Date(rawDate);
        if (isNaN(d.getTime())) return false;
        return d.getMonth().toString() === filterMonth;
      });
    }

    return list;
  }, [mediaList, openFolder, activeFilter, debouncedSearch, filterYear, filterMonth]);

  // Sort filtered media based on active sort rule
  const sortedAndFilteredMedia = useMemo(() => {
    const list = [...filteredMedia];

    list.sort((a, b) => {
      if (sortBy === 'date-desc') {
        const da = new Date(a.uploaded_at || a.created_at || a.uploadedAt || a.createdAt || 0).getTime();
        const db = new Date(b.uploaded_at || b.created_at || b.uploadedAt || b.createdAt || 0).getTime();
        return db - da;
      }
      if (sortBy === 'date-asc') {
        const da = new Date(a.uploaded_at || a.created_at || a.uploadedAt || a.createdAt || 0).getTime();
        const db = new Date(b.uploaded_at || b.created_at || b.uploadedAt || b.createdAt || 0).getTime();
        return da - db;
      }
      if (sortBy === 'size-desc') {
        const sa = Number(a.file_size || a.size_bytes || a.fileSize || 0);
        const sb = Number(b.file_size || b.size_bytes || b.fileSize || 0);
        return sb - sa;
      }
      if (sortBy === 'size-asc') {
        const sa = Number(a.file_size || a.size_bytes || a.fileSize || 0);
        const sb = Number(b.file_size || b.size_bytes || b.fileSize || 0);
        return sa - sb;
      }
      if (sortBy === 'name-asc') {
        const na = (a.original_filename || a.filename || a.name || '').toLowerCase();
        const nb = (b.original_filename || b.filename || b.name || '').toLowerCase();
        return na.localeCompare(nb);
      }
      if (sortBy === 'name-desc') {
        const na = (a.original_filename || a.filename || a.name || '').toLowerCase();
        const nb = (b.original_filename || b.filename || b.name || '').toLowerCase();
        return nb.localeCompare(na);
      }
      return 0;
    });

    return list;
  }, [filteredMedia, sortBy]);

  // Grouping utility based on groupBy (Day/Date, Month, Year, Size, or Flat)
  const groupedMedia = useMemo(() => {
    const groups = {};

    if (groupBy === 'none') {
      if (sortedAndFilteredMedia.length > 0) {
        groups['All Files'] = sortedAndFilteredMedia;
      }
      return groups;
    }

    if (groupBy === 'size') {
      const BRACKET_OVER_100M = '> 100 MB (Very Large)';
      const BRACKET_10_100M = '10 MB – 100 MB (Large)';
      const BRACKET_1_10M = '1 MB – 10 MB (Medium)';
      const BRACKET_UNDER_1M = '< 1 MB (Small)';

      sortedAndFilteredMedia.forEach((item) => {
        const size = Number(item.file_size || item.size_bytes || item.fileSize || 0);
        let label = BRACKET_UNDER_1M;
        if (size >= 100 * 1024 * 1024) label = BRACKET_OVER_100M;
        else if (size >= 10 * 1024 * 1024) label = BRACKET_10_100M;
        else if (size >= 1 * 1024 * 1024) label = BRACKET_1_10M;

        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
      });
      return groups;
    }

    if (groupBy === 'year') {
      sortedAndFilteredMedia.forEach((item) => {
        const rawDate = item.uploaded_at || item.created_at || item.uploadedAt || item.createdAt;
        const dateObj = new Date(rawDate);
        let label = 'Unknown Date';
        if (!isNaN(dateObj.getTime())) {
          label = `${dateObj.getFullYear()}`;
        }
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
      });
      return groups;
    }

    if (groupBy === 'month') {
      sortedAndFilteredMedia.forEach((item) => {
        const rawDate = item.uploaded_at || item.created_at || item.uploadedAt || item.createdAt;
        const dateObj = new Date(rawDate);
        let label = 'Unknown Date';
        if (!isNaN(dateObj.getTime())) {
          label = dateObj.toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          });
        }
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
      });
      return groups;
    }

    // Default: 'date' (By Day)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfToday.getDate() - 1);

    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfToday.getDate() + 1);

    sortedAndFilteredMedia.forEach((item) => {
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
  }, [sortedAndFilteredMedia, groupBy]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectGroup = (items = []) => {
    if (!items.length) return;
    const allSelected = items.every((m) => selectedIds.has(m.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        items.forEach((m) => next.delete(m.id));
      } else {
        items.forEach((m) => next.add(m.id));
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === sortedAndFilteredMedia.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAndFilteredMedia.map((m) => m.id)));
    }
  };

  const handleOpenLightbox = (item) => {
    const idx = sortedAndFilteredMedia.findIndex((m) => m.id === item.id);
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

        setMediaList((prev) => prev.filter((m) => !idSet.has(m.id)));
        for (const id of ids) {
          pandaCache.removeMediaItem(id);
        }
        pandaCache.invalidate('storage:metrics');

        const results = await Promise.allSettled(
          ids.map((id) =>
            fetch(`/api/media/${id}`, { method: 'DELETE', headers: getHeaders(), credentials: 'include' })
          )
        );

        const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
        setSelectedIds(new Set());
        success(`Successfully deleted ${succeeded} of ${ids.length} files.`);
      } else if (deleteTarget?.id) {
        const delId = deleteTarget.id;
        setMediaList((prev) => prev.filter((m) => m.id !== delId));
        pandaCache.removeMediaItem(delId);
        pandaCache.invalidate('storage:metrics');

        const res = await fetch(`/api/media/${delId}`, { method: 'DELETE', headers: getHeaders(), credentials: 'include' });
        if (res.ok) {
          success('Media file deleted from cloud storage.');
        } else {
          toastError('Failed to delete file from cloud storage.');
        }
      }
      setDeleteTarget(null);
      fetchContent({ silent: true, force: true });
      fetchFolders(true);
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

  const handleUploadClick = (folderId = null) => {
    if (!hasStorage) {
      if (onOpenConnectStorage) onOpenConnectStorage();
    } else if (onOpenUpload) {
      onOpenUpload(folderId || (openFolder ? openFolder.id : null));
    }
  };

  const currentFolderStyle = openFolder
    ? (FOLDER_COLOR_CLASSES[openFolder.color] || FOLDER_COLOR_CLASSES.teal)
    : FOLDER_COLOR_CLASSES.teal;

  return (
    <div className="space-y-6">
      {/* ── Folder Breadcrumb & Action Bar ── */}
      {openFolder && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-card animate-slide-up">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpenFolder(null)}
              className="p-2 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>All Files</span>
            </button>
            <span className="text-slate-600">/</span>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-xl ${currentFolderStyle.bg} ${currentFolderStyle.border} border flex items-center justify-center`}>
                <FolderOpen className={`w-4 h-4 ${currentFolderStyle.icon} fill-current opacity-80`} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">{openFolder.name}</h2>
                <p className="text-[11px] text-slate-400 font-mono">
                  {filteredMedia.length} {filteredMedia.length === 1 ? 'file' : 'files'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              icon={Trash2}
              onClick={() => setDeleteFolderTarget(openFolder)}
              className="text-rose-400 hover:text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
            >
              Delete Folder
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              onClick={() => handleUploadClick(openFolder.id)}
            >
              Upload Here
            </Button>
          </div>
        </div>
      )}

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
              placeholder="Search files..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Filter / Sort Button & Popover */}
          <div className="relative" ref={sortMenuRef}>
            <button
              type="button"
              onClick={() => setSortMenuOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold border transition-all ${
                sortMenuOpen || sortBy !== 'date-desc' || groupBy !== 'date' || filterYear !== 'all' || filterMonth !== 'all'
                  ? 'bg-teal-500/15 border-teal-500/40 text-teal-300 shadow-glow-teal'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Filter, Sort & Group files"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filter & Sort</span>
              {(sortBy !== 'date-desc' || groupBy !== 'date' || filterYear !== 'all' || filterMonth !== 'all') && (
                <span className="w-2 h-2 rounded-full bg-teal-400 shadow-glow-teal" />
              )}
            </button>

            {sortMenuOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 shadow-2xl z-40 space-y-4 animate-scale-in text-xs select-none max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-teal-400" />
                    <span className="font-bold text-white text-xs">Filter & Organize</span>
                  </div>
                  {(sortBy !== 'date-desc' || groupBy !== 'date' || filterYear !== 'all' || filterMonth !== 'all') && (
                    <button
                      onClick={() => {
                        setSortBy('date-desc');
                        setGroupBy('date');
                        setFilterYear('all');
                        setFilterMonth('all');
                      }}
                      className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset All</span>
                    </button>
                  )}
                </div>

                {/* Date Filter Section: Year & Month */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5 px-1">
                    <Calendar className="w-3.5 h-3.5 text-teal-400" />
                    <span>Filter by Year & Month</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
                    {/* Year Select */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">Year</span>
                      <select
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 cursor-pointer"
                      >
                        <option value="all">All Years</option>
                        {availableYears.map((yr) => (
                          <option key={yr} value={yr}>
                            {yr}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Month Select */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">Month</span>
                      <select
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 cursor-pointer"
                      >
                        {MONTH_NAMES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Group By Section */}
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5 px-1">
                    <Layers className="w-3.5 h-3.5 text-teal-400" />
                    <span>Group By</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-950/60 p-1.5 rounded-2xl border border-slate-800/80">
                    {[
                      { id: 'date', label: 'Day / Date', icon: Calendar },
                      { id: 'month', label: 'Month', icon: CalendarDays },
                      { id: 'year', label: 'Year', icon: CalendarDays },
                      { id: 'size', label: 'File Size', icon: HardDrive },
                      { id: 'none', label: 'Flat (No Group)', icon: Layers },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSelected = groupBy === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setGroupBy(item.id)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left transition-all ${
                            isSelected
                              ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sort By Section */}
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5 px-1">
                    <ArrowUpDown className="w-3.5 h-3.5 text-teal-400" />
                    <span>Sort Order</span>
                  </label>
                  <div className="space-y-1 bg-slate-950/60 p-1.5 rounded-2xl border border-slate-800/80">
                    {[
                      { id: 'date-desc', label: 'Date: Newest First' },
                      { id: 'date-asc', label: 'Date: Oldest First' },
                      { id: 'size-desc', label: 'Size: Largest First' },
                      { id: 'size-asc', label: 'Size: Smallest First' },
                      { id: 'name-asc', label: 'Name: A → Z' },
                      { id: 'name-desc', label: 'Name: Z → A' },
                    ].map((item) => {
                      const isSelected = sortBy === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSortBy(item.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all ${
                            isSelected
                              ? 'bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/30'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                          }`}
                        >
                          <span>{item.label}</span>
                          {isSelected && <span className="w-2 h-2 rounded-full bg-teal-400 shadow-glow-teal" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
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

          {hasStorage && !openFolder && (
            <Button
              variant="secondary"
              size="sm"
              icon={FolderPlus}
              onClick={() => setCreateFolderOpen(true)}
              title="Create a new folder to organise your media"
            >
              New Folder
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            icon={Upload}
            onClick={() => handleUploadClick(openFolder ? openFolder.id : null)}
          >
            {openFolder ? 'Upload File' : 'Upload Media'}
          </Button>
        </div>
      </div>

      {/* Active Date Filter Chips Bar */}
      {(filterYear !== 'all' || filterMonth !== 'all') && (
        <div className="flex items-center gap-2 flex-wrap text-xs animate-slide-up pt-1">
          <span className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Filtered by:</span>
          {filterYear !== 'all' && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 font-medium">
              <span>Year: <strong>{filterYear}</strong></span>
              <button
                type="button"
                onClick={() => setFilterYear('all')}
                className="hover:text-white rounded-full p-0.5"
                title="Remove year filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {filterMonth !== 'all' && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 font-medium">
              <span>Month: <strong>{MONTH_NAMES.find((m) => m.id === filterMonth)?.label || filterMonth}</strong></span>
              <button
                type="button"
                onClick={() => setFilterMonth('all')}
                className="hover:text-white rounded-full p-0.5"
                title="Remove month filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setFilterYear('all');
              setFilterMonth('all');
            }}
            className="text-[11px] text-slate-400 hover:text-rose-400 font-medium ml-1 transition-colors underline"
          >
            Clear date filters
          </button>
        </div>
      )}

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
        <div className="sticky top-20 z-30 flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/95 border border-teal-500/40 backdrop-blur-md shadow-2xl animate-slide-up">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Clear selection (Esc)"
            >
              <X className="w-4 h-4" />
            </button>

            <span className="text-xs font-semibold text-white">
              {selectedIds.size} {selectedIds.size === 1 ? 'item selected' : 'items selected'}
            </span>

            <span className="text-slate-600 hidden sm:inline">|</span>

            <button
              onClick={selectAll}
              className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>
                {selectedIds.size === filteredMedia.length ? 'Deselect entire library' : 'Select entire library'}
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

      {/* Main Content Area */}
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
      ) : (
        <div className="space-y-8">
          {/* Folders Section — shown at root view */}
          {!openFolder && folderList.length > 0 && (
            <FolderGrid
              folders={folderList}
              folderCounts={folderCounts}
              onFolderClick={(f) => setOpenFolder(f)}
              onDeleteFolder={(f) => setDeleteFolderTarget(f)}
            />
          )}

          {/* Media Items Area */}
          {openFolder ? (
            /* Inside a Folder */
            filteredMedia.length === 0 ? (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-md mx-auto shadow-card space-y-4 animate-slide-up">
                <div className={`w-14 h-14 rounded-2xl ${currentFolderStyle.bg} ${currentFolderStyle.border} border flex items-center justify-center mx-auto`}>
                  <FolderOpen className={`w-7 h-7 ${currentFolderStyle.icon} fill-current opacity-80`} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">This folder is empty</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload photos, videos, PDFs or documents directly into <strong className="text-slate-200">"{openFolder.name}"</strong>.
                  </p>
                </div>
                <div className="pt-2 flex justify-center">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Upload}
                    onClick={() => handleUploadClick(openFolder.id)}
                  >
                    Upload to this Folder
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(groupedMedia).map(([dateLabel, items]) => {
                  const allInGroupSelected = items.length > 0 && items.every((m) => selectedIds.has(m.id));
                  const someInGroupSelected = items.some((m) => selectedIds.has(m.id));

                  return (
                    <div key={dateLabel} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                            {dateLabel}
                          </h3>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({items.length} {items.length === 1 ? 'file' : 'files'})
                          </span>
                        </div>

                        <div className="flex-1 border-t border-slate-800/80 mx-2" />

                        {/* Mobile Gallery style Select All button for this day - only visible when selection mode is active */}
                        {isSelectionMode && (
                          <button
                            type="button"
                            onClick={() => toggleSelectGroup(items)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
                              allInGroupSelected
                                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                                : someInGroupSelected
                                ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:text-white'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                            title={allInGroupSelected ? `Deselect all files in ${dateLabel}` : `Select all files in ${dateLabel}`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                                allInGroupSelected
                                  ? 'border-teal-400 bg-slate-950 shadow-glow-teal'
                                  : someInGroupSelected
                                  ? 'border-teal-400/80 bg-slate-950'
                                  : 'border-slate-500 bg-slate-950/40'
                              }`}
                            >
                              {allInGroupSelected ? (
                                <span className="w-2 h-2 rounded-full bg-teal-400 animate-scale-in" />
                              ) : someInGroupSelected ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-400/70" />
                              ) : null}
                            </div>
                            <span>{allInGroupSelected ? 'Deselect day' : 'Select all'}</span>
                          </button>
                        )}
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
                  );
                })}
              </div>
            )
          ) : (
            /* At Root Level */
            filteredMedia.length === 0 && folderList.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-card space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">
                    {searchInput || activeFilter !== MEDIA_CATEGORIES.ALL ? 'No matching files found' : 'No media files yet'}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    {searchInput
                      ? `No items found matching "${searchInput}".`
                      : activeFilter !== MEDIA_CATEGORIES.ALL
                      ? `No ${activeFilter} found in your library.`
                      : folderList.length > 0
                      ? 'Open a folder above and upload your files there to keep your library organised.'
                      : 'Upload photos, videos, PDFs, or documents to store in your connected cloud storage.'}
                  </p>
                </div>
                <div className="pt-2 flex justify-center gap-3">
                  {searchInput || activeFilter !== MEDIA_CATEGORIES.ALL ? (
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
                  ) : null}
                  {/* Only show the root-level upload button when there are no folders */}
                  {!folderList.length && (
                    <Button variant="primary" size="sm" icon={Upload} onClick={() => handleUploadClick(null)}>
                      Upload File
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(groupedMedia).map(([dateLabel, items]) => {
                  const allInGroupSelected = items.length > 0 && items.every((m) => selectedIds.has(m.id));
                  const someInGroupSelected = items.some((m) => selectedIds.has(m.id));

                  return (
                    <div key={dateLabel} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                            {dateLabel}
                          </h3>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({items.length} {items.length === 1 ? 'file' : 'files'})
                          </span>
                        </div>

                        <div className="flex-1 border-t border-slate-800/80 mx-2" />

                        {/* Mobile Gallery style Select All button for this day - only visible when selection mode is active */}
                        {isSelectionMode && (
                          <button
                            type="button"
                            onClick={() => toggleSelectGroup(items)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
                              allInGroupSelected
                                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                                : someInGroupSelected
                                ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:text-white'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                            title={allInGroupSelected ? `Deselect all files in ${dateLabel}` : `Select all files in ${dateLabel}`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                                allInGroupSelected
                                  ? 'border-teal-400 bg-slate-950 shadow-glow-teal'
                                  : someInGroupSelected
                                  ? 'border-teal-400/80 bg-slate-950'
                                  : 'border-slate-500 bg-slate-950/40'
                              }`}
                            >
                              {allInGroupSelected ? (
                                <span className="w-2 h-2 rounded-full bg-teal-400 animate-scale-in" />
                              ) : someInGroupSelected ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-400/70" />
                              ) : null}
                            </div>
                            <span>{allInGroupSelected ? 'Deselect day' : 'Select all'}</span>
                          </button>
                        )}
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
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      <MediaLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        mediaList={sortedAndFilteredMedia}
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

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onFolderCreated={(folder) => {
          setFolderList((prev) => {
            const already = prev.some((f) => f.id === folder.id);
            return already ? prev : [folder, ...prev];
          });
          success(`Folder "${folder.name}" created successfully.`);
          fetchFolders(true);
        }}
      />

      {/* Delete Folder Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!deleteFolderTarget}
        title={`Delete folder "${deleteFolderTarget?.name}"?`}
        message="This will delete the folder. Any files currently in this folder will remain safely in your library at root level."
        confirmText="Delete folder"
        confirmVariant="danger"
        isLoading={isDeletingFolder}
        onConfirm={executeDeleteFolder}
        onCancel={() => setDeleteFolderTarget(null)}
      />

      {/* Delete Media Confirmation Modal */}
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
