'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Upload, HardDrive, ShieldCheck, CheckCircle2, AlertCircle, FileText, X, Plus, Cloud, Folder, Loader2 } from 'lucide-react';
import { Progress, formatBytes } from '@/components/ui/Progress';
import { useToast } from '@/components/context/ToastContext';
import { useAuth } from '@/components/context/AuthContext';

export function MediaUploadModal({
  isOpen,
  onClose,
  initialFolderId = null,
  onUploadSuccess,
  onOpenConnectStorage,
}) {
  const { session } = useAuth();
  const { success, error: toastError } = useToast();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [storageProviders, setStorageProviders] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedStorage, setSelectedStorage] = useState('auto');
  const [selectedFolder, setSelectedFolder] = useState('root');
  const [encryptPayload, setEncryptPayload] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  const [isLoadingStorage, setIsLoadingStorage] = useState(true);

  // Fetch available storage connections and folders
  useEffect(() => {
    if (isOpen) {
      setIsLoadingStorage(true);
      setSelectedFolder(initialFolderId || 'root');

      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Parallel fetch with authorization
      Promise.allSettled([
        fetch('/api/storage', { headers }).then((res) => res.json()),
        fetch('/api/media/folders', { headers }).then((res) => res.json()),
      ])
        .then(([storageResult, foldersResult]) => {
          if (storageResult.status === 'fulfilled' && storageResult.value?.connections) {
            const conns = storageResult.value.connections;
            setStorageProviders(conns);
            const defaultConn = conns.find((c) => c.is_default) || conns[0];
            if (defaultConn) {
              setSelectedStorage(defaultConn.id);
            }
          }
          if (foldersResult.status === 'fulfilled' && foldersResult.value?.folders) {
            setFolders(foldersResult.value.folders);
          }
        })
        .finally(() => {
          setIsLoadingStorage(false);
        });
    }
  }, [isOpen, initialFolderId, session?.access_token]);

  const handleFileSelect = (e) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setUploadError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
      setUploadError(null);
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    if (storageProviders.length === 0) {
      toastError('Please connect cloud storage before uploading media.');
      if (onOpenConnectStorage) onOpenConnectStorage();
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      setCurrentFileIndex(i);
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storageId', selectedStorage);
      formData.append('folderId', selectedFolder === 'root' ? '' : selectedFolder);
      formData.append('encrypt', String(encryptPayload));

      try {
        const headers = {};
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/media/upload', {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Upload failed for ${file.name}`);
        }

        successCount++;
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      } catch (err) {
        setUploadError(err.message);
        setIsUploading(false);
        return;
      }
    }

    setIsUploading(false);
    success(`Successfully uploaded ${successCount} file(s) to encrypted cloud storage.`);
    setFiles([]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('panda:media:uploaded'));
      window.dispatchEvent(new CustomEvent('panda:storage:updated'));
    }
    if (onUploadSuccess) onUploadSuccess();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isUploading) {
          setFiles([]);
          setUploadError(null);
          onClose();
        }
      }}
      title="Upload to Media Library"
      subtitle="Files are encrypted with AES-256-GCM and stored in your connected cloud object storage."
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        {/* Loading state while checking storage connections */}
        {isLoadingStorage ? (
          <div className="p-8 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
            <span className="text-xs">Checking connected storage providers...</span>
          </div>
        ) : storageProviders.length === 0 ? (
          <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-3">
            <div className="flex items-center gap-2 font-semibold text-amber-200">
              <Cloud className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Cloud Storage Connection Required</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Panda stores media files directly in <strong>your own cloud storage</strong> (R2, B2, S3, MinIO) to maintain privacy and data ownership. Connect a storage provider before uploading.
            </p>
            <div className="pt-1">
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={onOpenConnectStorage}
                className="w-full rounded-2xl"
              >
                Connect Cloud Storage
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* File Dropzone */}
            {files.length === 0 ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700/80 hover:border-teal-500/80 rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-950/40 hover:bg-slate-900/60 transition-colors group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 text-teal-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-white">Click or drag & drop files here</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Supports photos, videos, PDFs, and documents up to 500MB
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Selected Files ({files.length})</span>
                  <button
                    type="button"
                    onClick={() => setFiles([])}
                    className="text-slate-400 hover:text-rose-400 transition-colors"
                    disabled={isUploading}
                  >
                    Clear all
                  </button>
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <FileText className="w-4 h-4 text-teal-400 shrink-0" />
                        <span className="text-slate-200 font-medium truncate">{file.name}</span>
                        <span className="text-slate-400 font-mono text-[11px]">({formatBytes(file.size)})</span>
                      </div>
                      {!isUploading && (
                        <button
                          onClick={() => removeFile(idx)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded-lg"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Folder & Storage Destination Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-3xl bg-slate-950/60 border border-slate-800 text-xs">
              <div>
                <label className="text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-teal-400" />
                  <span>Destination Folder</span>
                </label>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  disabled={isUploading}
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  <option value="root">Root (No Folder)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-teal-400" />
                  <span>Storage Target</span>
                </label>
                <select
                  value={selectedStorage}
                  onChange={(e) => setSelectedStorage(e.target.value)}
                  disabled={isUploading}
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  <option value="auto">Automatic (Default)</option>
                  {storageProviders.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name} ({sp.provider.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Encryption Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="encryptPayload"
                checked={encryptPayload}
                onChange={(e) => setEncryptPayload(e.target.checked)}
                disabled={isUploading}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-teal-500 focus:ring-teal-500"
              />
              <label htmlFor="encryptPayload" className="text-xs text-slate-300 select-none cursor-pointer flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>Encrypt with AES-256-GCM before writing to cloud storage</span>
              </label>
            </div>

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950 border border-teal-500/40 animate-slide-up">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <span>Uploading file {currentFileIndex + 1} of {files.length}...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            {/* Error Message */}
            {uploadError && (
              <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-slide-up">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onClose}
                disabled={isUploading}
                className="rounded-2xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleUpload}
                isLoading={isUploading}
                disabled={files.length === 0}
                icon={Upload}
                className="rounded-2xl"
              >
                Upload {files.length > 0 ? `(${files.length})` : ''}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
