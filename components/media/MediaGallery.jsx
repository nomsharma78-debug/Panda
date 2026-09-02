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

export function MediaGallery({ onOpenUpload, onOpenConnectStorage }) {
  const { session } = useAuth();
  const { success, error: toastError } = useToast();

  const [mediaList, setMediaList] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null); // null = Root
  const [hasStorage, setHasStorage] = useState(true);
  const [loading, setLoading] = useState(true);
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

  const initialLoadedRef = React.useRef(false);

  const fetchMediaAndFolders = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent && !initialLoadedRef.current) {
        setLoading(true);
      }

      const params = new URLSearchParams();
      if (activeFilter !== 'all') params.set('type', activeFilter);
      if (searchQuery) params.set('search', searchQuery);
      if (currentFolder) {
        params.set('folderId', currentFolder.id);
      }

      const foldersUrl = `/api/media/folders${currentFolder ? `?parentId=${currentFolder.id}` : ''}`;
      const mediaUrl = `/api/media?${params.toString()}`;

      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Parallel execution for maximum speed (<100ms)
      const [storageRes, foldersRes, mediaRes] = await Promise.allSettled([
        fetch('/api/storage', { headers }),
        fetch(foldersUrl, { headers }),
        fetch(mediaUrl, { headers }),
      ]);

      let storageConnected = false;
      if (storageRes.status === 'fulfilled' && storageRes.value.ok) {
        const storageData = await storageRes.value.json();
        storageConnected = (storageData.connections || []).length > 0;
        setHasStorage(storageConnected);
      }

      if (foldersRes.status === 'fulfilled' && foldersRes.value.ok) {
        const foldersData = await foldersRes.value.json();
        setFolders(foldersData.folders || []);
      }

      if (mediaRes.status === 'fulfilled' && mediaRes.value.ok) {
        const mediaData = await mediaRes.value.json();
        setMediaList(mediaData.items || []);
      }
    } catch (err) {
      console.error('Fetch media error:', err);
    } finally {
      initialLoadedRef.current = true;
      setLoading(false);
    }
  }, [activeFilter, searchQuery, currentFolder, session?.access_token]);

  useEffect(() => {
    fetchMediaAndFolders(initialLoadedRef.current);
  }, [fetchMediaAndFolders]);

  // Listen to global upload/storage events
  useEffect(() => {
    const handleUpdated = () => fetchMediaAndFolders();
    window.addEventListener('panda:media:uploaded', handleUpdated);
    window.addEventListener('panda:storage:updated', handleUpdated);
    return () => {
      window.removeEventListener('panda:media:uploaded', handleUpdated);
      window.removeEventListener('panda:storage:updated', handleUpdated);
    };
  }, [fetchMediaAndFolders]);

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
        for (const id of ids) {
          await fetch(`/api/media/${id}`, { method: 'DELETE' });
        }
        success(`Deleted ${ids.length} files successfully.`);
        setSelectedIds(new Set());
        setIsSelectionMode(false);
      } else if (deleteTarget?.id) {
        const res = await fetch(`/api/media/${deleteTarget.id}`, { method: 'DELETE' });
        if (res.ok) {
          success(`Deleted "${deleteTarget.original_filename}"`);
        } else {
          toastError('Failed to delete file');
        }
      }
      setDeleteTarget(null);
      fetchMediaAndFolders();
      window.dispatchEvent(new CustomEvent('panda:media:uploaded'));
    } catch {
      toastError('Network error deleting files');
    } finally {
      setIsDeleting(false);
    }
  };

  const executeDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/media/folders?id=${deleteFolderTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        success(`Folder "${deleteFolderTarget.name}" deleted.`);
        if (currentFolder?.id === deleteFolderTarget.id) {
          setCurrentFolder(null);
        }
        fetchMediaAndFolders();
      } else {
        toastError('Failed to delete folder');
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
    } else {
      onOpenUpload();
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
              onClick={() => setCurrentFolder(null)}
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
              onClick={() => setCurrentFolder(null)}
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
                    onOpen={(f) => setCurrentFolder(f)}
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
                <Button variant="primary" size="sm" icon={Upload} onClick={onOpenUpload}>
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
        onFolderCreated={() => fetchMediaAndFolders()}
      />

      {/* LIGHTBOX FOR PHOTO / VIDEO / PDF PREVIEW */}
      <MediaLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        mediaList={mediaList}
        initialIndex={lightboxIndex}
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
