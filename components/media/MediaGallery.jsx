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
  Filter,
  RefreshCw,
  HardDrive,
  HelpCircle,
  ShieldCheck,
  Plus,
  ArrowRight,
  Cloud,
  FolderPlus,
  Folder,
  ChevronRight,
  ArrowLeft,
  Home,
} from 'lucide-react';
import { MediaCard } from './MediaCard';
import { MediaLightbox } from './MediaLightbox';
import { FolderCard } from './FolderCard';
import { CreateFolderModal } from './CreateFolderModal';
import { MediaGridSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StorageHowItWorksModal } from '@/components/storage/StorageHowItWorksModal';
import { useToast } from '@/components/context/ToastContext';
import { useAuth } from '@/components/context/AuthContext';
import { pandaCache } from '@/lib/client-cache';

export function MediaGallery({ onOpenUpload, onOpenConnectStorage }) {
  const { session } = useAuth();
  const { success, error: toastError } = useToast();

  // Restore from cache on mount for instant display
  const cachedRoot = pandaCache.get('media:root');
  const [mediaList, setMediaList] = useState(cachedRoot?.items || []);
  const [folders, setFolders] = useState(cachedRoot?.folders || []);
  const [currentFolder, setCurrentFolder] = useState(null); // null = Root
  const [hasStorage, setHasStorage] = useState(pandaCache.get('storage:connections') ? (pandaCache.get('storage:connections')?.connections || []).length > 0 : true);
  // Only show skeleton on very first load (no cache at all)
  const [loading, setLoading] = useState(!cachedRoot);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Modals state
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const abortRef = React.useRef(null);
  const mountedRef = React.useRef(true);
  const firstLoadDoneRef = React.useRef(!!cachedRoot); // skip full skeleton if cached

  // Auth headers helper
  const getHeaders = useCallback(() => {
    const h = {};
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  // Check storage from backend API (reusing cache when navigating)
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
        pandaCache.set('storage:connections', data, 60_000);
        setHasStorage(hasActiveConns);
      }
    } catch {}
  }, [session?.access_token]);

  const handleNavigateFolder = useCallback((folder) => {
    setCurrentFolder(folder);
    const key = folder ? `media:folder:${folder.id}` : 'media:root';
    const cached = pandaCache.get(key);
    if (cached) {
      setFolders(cached.folders || []);
      setMediaList(cached.items || []);
      setLoading(false);
    } else {
      setFolders([]);
      setMediaList([]);
      setLoading(true);
    }
  }, []);

  // Fast fetch: only media + folders
  const fetchContent = useCallback(async (opts = {}) => {
    const { folder = currentFolder, filter = activeFilter, search = searchQuery, sync = false } = opts;

    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('type', filter);
      if (search) params.set('search', search);
      if (folder) params.set('folderId', folder.id);
      if (sync) params.set('sync', 'true');
      if (session?.access_token) params.set('token', session.access_token);

      const foldersUrl = `/api/media/folders${folder ? `?parentId=${folder.id}` : ''}`;
      const mediaUrl = `/api/media?${params.toString()}`;
      const headers = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const [foldersRes, mediaRes] = await Promise.all([
        fetch(foldersUrl, { headers, credentials: 'include' }),
        fetch(mediaUrl, { headers, credentials: 'include' }),
      ]);

      let newFolders = [];
      let newItems = [];

      if (foldersRes.ok) {
        const data = await foldersRes.json();
        newFolders = data.folders || [];
        setFolders(newFolders);
      }

      if (mediaRes.ok) {
        const data = await mediaRes.json();
        newItems = data.items || [];
        setMediaList((prev) => {
          // If server returned items, use them; if server returned 0 items but we already had items and no filter/search, keep previous
          if (newItems.length > 0 || (filter !== 'all' || search)) {
            return newItems;
          }
          return prev.length > 0 ? prev : newItems;
        });
        if (filter === 'all' && !search && newItems.length > 0) {
          const key = folder ? `media:folder:${folder.id}` : 'media:root';
          pandaCache.set(key, { items: newItems, folders: newFolders }, 45_000);
        }
      }
    } catch (err) {
      console.error('[MediaGallery] Fetch content error:', err);
    } finally {
      firstLoadDoneRef.current = true;
      setLoading(false);
    }
  }, [currentFolder, activeFilter, searchQuery, session?.access_token]);

  // Load content on mount and whenever auth token, folder, filter, or search changes
  useEffect(() => {
    checkStorage(false);
    fetchContent({});
  }, [session?.access_token, currentFolder, activeFilter, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen to global upload/storage events
  useEffect(() => {
    const handleMediaUploaded = (e) => {
      if (e?.detail?.newItems && Array.isArray(e.detail.newItems) && e.detail.newItems.length > 0) {
        setMediaList((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = e.detail.newItems.filter((m) => !existingIds.has(m.id));
          return [...toAdd, ...prev];
        });
      }
      pandaCache.invalidatePrefix('media:');
      fetchContent({});
    };

    const handleStorageUpdated = () => {
      pandaCache.invalidate('storage:connections');
      checkStorage(true);
    };

    window.addEventListener('panda:media:uploaded', handleMediaUploaded);
    window.addEventListener('panda:storage:updated', handleStorageUpdated);
    return () => {
      window.removeEventListener('panda:media:uploaded', handleMediaUploaded);
      window.removeEventListener('panda:storage:updated', handleStorageUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Date grouping utility
  const groupedMedia = useMemo(() => {
    const groups = {};

    mediaList.forEach((item) => {
      const dateObj = new Date(item.uploaded_at || item.created_at);
      const now = new Date();

      const isToday =
        dateObj.getDate() === now.getDate() &&
        dateObj.getMonth() === now.getMonth() &&
        dateObj.getFullYear() === now.getFullYear();

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        dateObj.getDate() === yesterday.getDate() &&
        dateObj.getMonth() === yesterday.getMonth() &&
        dateObj.getFullYear() === yesterday.getFullYear();

      let label = '';
      if (isToday) {
        label = 'Today';
      } else if (isYesterday) {
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
  }, [mediaList]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === mediaList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(mediaList.map((m) => m.id)));
    }
  };

  const handleOpenLightbox = (item) => {
    const idx = mediaList.findIndex((m) => m.id === item.id);
    if (idx !== -1) {
      setLightboxIndex(idx);
      setLightboxOpen(true);
    }
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteTarget === 'bulk') {
        const ids = Array.from(selectedIds);
        // Optimistically remove from UI immediately
        setMediaList((prev) => prev.filter((m) => !ids.includes(m.id)));
        for (const id of ids) {
          await fetch(`/api/media/${id}`, { method: 'DELETE', headers: getHeaders(), credentials: 'include' });
        }
        success(`Deleted ${ids.length} files successfully.`);
        setSelectedIds(new Set());
        setIsSelectionMode(false);
      } else if (deleteTarget?.id) {
        // Optimistically remove from UI immediately
        setMediaList((prev) => prev.filter((m) => m.id !== deleteTarget.id));
        const res = await fetch(`/api/media/${deleteTarget.id}`, { method: 'DELETE', headers: getHeaders(), credentials: 'include' });
        if (res.ok) {
          success(`Deleted "${deleteTarget.original_filename}"`);
        } else {
          toastError('Failed to delete file');
          fetchContent({ silent: true }); // Restore list on failure
        }
      }
      setDeleteTarget(null);
      fetchContent({ silent: true });
    } catch {
      toastError('Network error deleting files');
    } finally {
      setIsDeleting(false);
    }
  };

  const executeDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    setIsDeleting(true);
    // Optimistically remove folder from list
    setFolders((prev) => prev.filter((f) => f.id !== deleteFolderTarget.id));
    try {
      const res = await fetch(`/api/media/folders?id=${deleteFolderTarget.id}`, { method: 'DELETE', headers: getHeaders(), credentials: 'include' });
      if (res.ok) {
        success(`Folder "${deleteFolderTarget.name}" deleted.`);
        if (currentFolder?.id === deleteFolderTarget.id) {
          setCurrentFolder(null);
        }
        fetchContent({ silent: true });
      } else {
        toastError('Failed to delete folder');
        fetchContent({ silent: true }); // Restore on failure
      }
    } catch {
      toastError('Network error deleting folder');
    } finally {
      setIsDeleting(false);
      setDeleteFolderTarget(null);
    }
  };

  const handleBulkDownload = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      window.open(`/api/media/${id}/download`, '_blank');
    }
  };

  const filterTabs = [
    { id: 'all', label: 'All Files', icon: Layers },
    { id: 'photo', label: 'Photos', icon: ImageIcon },
    { id: 'video', label: 'Videos', icon: Film },
    { id: 'pdf', label: 'PDFs', icon: FileText },
    { id: 'document', label: 'Documents', icon: FileText },
    { id: 'archive', label: 'Archives', icon: Archive },
  ];

  const handleUploadClick = () => {
    if (!hasStorage) {
      if (onOpenConnectStorage) onOpenConnectStorage();
    } else if (onOpenUpload) {
      onOpenUpload(currentFolder?.id || null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Search Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFilter === tab.id;
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          {hasStorage && (
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              onClick={async () => {
                setLoading(true);
                pandaCache.invalidatePrefix('media:');
                pandaCache.invalidate('storage:connections');
                pandaCache.invalidate('storage:metrics');
                await fetchContent({ sync: true });
                await checkStorage(true);
                window.dispatchEvent(new CustomEvent('panda:storage:updated'));
                success('Cloud storage synchronized.');
              }}
              title="Synchronize all files from cloud storage buckets"
            >
              Sync
            </Button>
          )}

          {hasStorage && (
            <Button
              variant="secondary"
              size="sm"
              icon={FolderPlus}
              onClick={() => setCreateFolderOpen(true)}
            >
              New Folder
            </Button>
          )}

          {mediaList.length > 0 && (
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

      {/* Breadcrumbs Navigation Bar */}
      {hasStorage && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-400 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => handleNavigateFolder(null)}
              className={`flex items-center gap-1 hover:text-white transition-colors ${
                !currentFolder ? 'font-bold text-teal-400' : ''
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>All Media</span>
            </button>

            {currentFolder && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <span className="font-bold text-teal-300 flex items-center gap-1">
                  <Folder className="w-3.5 h-3.5 fill-current/20" />
                  <span>{currentFolder.name}</span>
                </span>
              </>
            )}
          </div>

          {currentFolder && (
            <button
              type="button"
              onClick={() => handleNavigateFolder(null)}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Back to Root</span>
            </button>
          )}
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
                {selectedIds.size === mediaList.length ? 'Deselect All' : 'Select All'} ({selectedIds.size})
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

      {/* ========================================================================= */}
      {/* MAIN GALLERY VIEW / ONBOARDING VIEW */}
      {/* ========================================================================= */}
      {loading ? (
        <MediaGridSkeleton count={10} />
      ) : !hasStorage && mediaList.length === 0 ? (
        /* ONBOARDING STATE WHEN ZERO STORAGE CONNECTED */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-card space-y-6 animate-slide-up">
          <div className="w-16 h-16 rounded-3xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400">
            <Cloud className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Your media library is ready when you are.
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
              Connect your own cloud storage (Cloudflare R2, Backblaze B2, or Amazon S3) to create folders and upload photos, videos, PDFs, and documents.
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
          {/* FOLDERS GRID (Rendered when folders exist in current scope) */}
          {folders.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Folders ({folders.length})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {folders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onOpen={(f) => handleNavigateFolder(f)}
                    onDelete={(f) => setDeleteFolderTarget(f)}
                    onRename={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {/* EMPTY STATE FOR CURRENT FOLDER / LIBRARY */}
          {mediaList.length === 0 && folders.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-card space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">
                  {currentFolder ? `"${currentFolder.name}" is empty` : 'No media files yet'}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {currentFolder
                    ? 'Upload photos, videos, or documents to store inside this folder.'
                    : 'Upload your first photo, video, PDF, or document to your connected cloud storage.'}
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <Button variant="secondary" size="sm" icon={FolderPlus} onClick={() => setCreateFolderOpen(true)}>
                  New Folder
                </Button>
                <Button variant="primary" size="sm" icon={Upload} onClick={() => onOpenUpload && onOpenUpload(currentFolder?.id || null)}>
                  Upload File
                </Button>
              </div>
            </div>
          ) : (
            /* MEDIA FILES GROUPED BY DATE */
            Object.entries(groupedMedia).map(([dateLabel, items]) => (
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
            ))
          )}
        </div>
      )}

      {/* CREATE FOLDER MODAL */}
      <CreateFolderModal
        isOpen={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        parentId={currentFolder?.id || null}
        onFolderCreated={(newFolder) => {
          // Optimistically add folder immediately
          if (newFolder) setFolders((prev) => [newFolder, ...prev]);
          fetchContent({ silent: true });
        }}
      />

      {/* LIGHTBOX FOR PHOTO / VIDEO / PDF PREVIEW */}
      <MediaLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        mediaList={mediaList}
        currentIndex={lightboxIndex}
        onIndexChange={(idx) => setLightboxIndex(idx)}
        onDelete={(item) => setDeleteTarget(item)}
      />

      {/* HOW IT WORKS MODAL */}
      <StorageHowItWorksModal
        isOpen={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
        onConnect={() => {
          setHowItWorksOpen(false);
          if (onOpenConnectStorage) onOpenConnectStorage();
        }}
      />

      {/* DELETE CONFIRMATION MODAL */}
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

      {/* DELETE FOLDER CONFIRMATION MODAL */}
      <ConfirmDialog
        isOpen={!!deleteFolderTarget}
        title={`Delete folder "${deleteFolderTarget?.name}"?`}
        message="Deleting this folder will remove the folder organization. Contained media files will safely remain in your library."
        confirmText="Delete Folder"
        confirmVariant="danger"
        isLoading={isDeleting}
        onConfirm={executeDeleteFolder}
        onCancel={() => setDeleteFolderTarget(null)}
      />
    </div>
  );
}
