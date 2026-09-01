'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, HardDrive, ArrowRight, Trash2, FolderSync } from 'lucide-react';
import { useToast } from '@/components/context/ToastContext';

export function DisconnectStorageModal({
  isOpen,
  onClose,
  storageItem,
  allStorage = [],
  onDisconnected,
}) {
  const { success, error: toastError } = useToast();
  const [handlingMode, setHandlingMode] = useState('keep'); // 'keep' | 'move' | 'delete_files'
  const [targetStorageId, setTargetStorageId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!storageItem) return null;

  const fileCount = parseInt(storageItem.file_count || '0', 10);
  const otherStorage = allStorage.filter((s) => s.id !== storageItem.id);

  const handleDisconnect = async () => {
    if (handlingMode === 'move' && !targetStorageId) {
      toastError('Please select a target storage location to move files.');
      return;
    }

    setIsProcessing(true);

    try {
      const res = await fetch(`/api/storage/${storageItem.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handlingMode,
          targetStorageId: handlingMode === 'move' ? targetStorageId : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to disconnect storage');
      }

      success(`Storage "${storageItem.name}" disconnected.`);
      if (onDisconnected) onDisconnected();
      onClose();
    } catch (err) {
      toastError(err.message || 'Disconnect failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isProcessing && onClose()}
      title="Disconnect Storage?"
      subtitle={`Disconnecting "${storageItem.name}" (${storageItem.provider.toUpperCase()})`}
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-5">
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">Files currently stored here:</span>
          <span className="font-semibold text-white font-mono text-sm">{fileCount} files</span>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-300">What should happen to these files?</label>

          {/* Option 1: Keep */}
          <label
            onClick={() => setHandlingMode('keep')}
            className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
              handlingMode === 'keep'
                ? 'bg-teal-500/10 border-teal-500/40 text-teal-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <input
              type="radio"
              name="handlingMode"
              checked={handlingMode === 'keep'}
              onChange={() => setHandlingMode('keep')}
              className="mt-0.5 text-teal-500"
            />
            <div>
              <p className="text-xs font-semibold">Keep files in bucket</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Preserve objects in your external cloud storage. Unlinks this connection from Panda.
              </p>
            </div>
          </label>

          {/* Option 2: Move */}
          {otherStorage.length > 0 && (
            <label
              onClick={() => setHandlingMode('move')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                handlingMode === 'move'
                  ? 'bg-teal-500/10 border-teal-500/40 text-teal-200'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <input
                type="radio"
                name="handlingMode"
                checked={handlingMode === 'move'}
                onChange={() => setHandlingMode('move')}
                className="mt-0.5 text-teal-500"
              />
              <div className="w-full">
                <p className="text-xs font-semibold">Move files to another connected storage</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Transfer files to another provider before disconnecting.
                </p>

                {handlingMode === 'move' && (
                  <select
                    value={targetStorageId}
                    onChange={(e) => setTargetStorageId(e.target.value)}
                    className="w-full mt-2.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="">Select target storage...</option>
                    {otherStorage.map((os) => (
                      <option key={os.id} value={os.id}>
                        {os.name} ({os.provider.toUpperCase()})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>
          )}

          {/* Option 3: Delete */}
          <label
            onClick={() => setHandlingMode('delete_files')}
            className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
              handlingMode === 'delete_files'
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <input
              type="radio"
              name="handlingMode"
              checked={handlingMode === 'delete_files'}
              onChange={() => setHandlingMode('delete_files')}
              className="mt-0.5 text-rose-500"
            />
            <div>
              <p className="text-xs font-semibold text-rose-300">Delete files permanently</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Permanently delete all stored files from the cloud provider bucket and vault.
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            variant={handlingMode === 'delete_files' ? 'danger' : 'primary'}
            onClick={handleDisconnect}
            isLoading={isProcessing}
          >
            {isProcessing ? 'Disconnecting...' : 'Disconnect Storage'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
