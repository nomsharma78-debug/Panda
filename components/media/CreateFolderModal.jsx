'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FolderPlus, Folder, Check } from 'lucide-react';
import { useToast } from '@/components/context/ToastContext';

const FOLDER_COLORS = [
  { id: 'teal', label: 'Teal', bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/40', ring: 'ring-teal-400' },
  { id: 'blue', label: 'Blue', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40', ring: 'ring-blue-400' },
  { id: 'indigo', label: 'Indigo', bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/40', ring: 'ring-indigo-400' },
  { id: 'purple', label: 'Purple', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40', ring: 'ring-purple-400' },
  { id: 'amber', label: 'Amber', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40', ring: 'ring-amber-400' },
  { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', ring: 'ring-emerald-400' },
  { id: 'rose', label: 'Rose', bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/40', ring: 'ring-rose-400' },
];

export function CreateFolderModal({ isOpen, onClose, parentId = null, onFolderCreated }) {
  const { success, error: toastError } = useToast();
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState('teal');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toastError('Folder name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/media/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          parentId,
          color: selectedColor,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create folder');
      }

      success(`Folder "${name.trim()}" created successfully.`);
      setName('');
      setSelectedColor('teal');
      onClose();
      if (onFolderCreated) onFolderCreated(data.folder);
      window.dispatchEvent(new CustomEvent('panda:media:uploaded'));
    } catch (err) {
      toastError(err.message || 'Failed to create folder');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Folder"
      subtitle="Organize photos, videos, and documents in your cloud storage."
      maxWidth="max-w-md"
    >
      <form onSubmit={handleCreate} className="space-y-4">
        <Input
          label="Folder Name"
          placeholder="e.g. Vacation 2026, Work Documents, Receipts"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          className="rounded-2xl"
        />

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Folder Color Tag</label>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {FOLDER_COLORS.map((col) => {
              const active = selectedColor === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setSelectedColor(col.id)}
                  className={`w-8 h-8 rounded-full ${col.bg} border ${col.border} flex items-center justify-center transition-all ${
                    active ? `ring-2 ${col.ring} scale-110 shadow-sm` : 'hover:scale-105'
                  }`}
                  title={col.label}
                >
                  {active && <Check className={`w-3.5 h-3.5 ${col.text}`} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            icon={FolderPlus}
          >
            Create Folder
          </Button>
        </div>
      </form>
    </Modal>
  );
}
