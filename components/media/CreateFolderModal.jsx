'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FolderPlus, Folder } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/context/AuthContext';

const FOLDER_COLORS = [
  { id: 'teal',   label: 'Teal',   bg: 'bg-teal-500',   ring: 'ring-teal-400',   text: 'text-teal-400'   },
  { id: 'violet', label: 'Violet', bg: 'bg-violet-500', ring: 'ring-violet-400', text: 'text-violet-400' },
  { id: 'amber',  label: 'Amber',  bg: 'bg-amber-500',  ring: 'ring-amber-400',  text: 'text-amber-400'  },
  { id: 'rose',   label: 'Rose',   bg: 'bg-rose-500',   ring: 'ring-rose-400',   text: 'text-rose-400'   },
  { id: 'sky',    label: 'Sky',    bg: 'bg-sky-500',    ring: 'ring-sky-400',    text: 'text-sky-400'    },
  { id: 'emerald',label: 'Green',  bg: 'bg-emerald-500',ring: 'ring-emerald-400',text: 'text-emerald-400'},
  { id: 'orange', label: 'Orange', bg: 'bg-orange-500', ring: 'ring-orange-400', text: 'text-orange-400' },
  { id: 'slate',  label: 'Slate',  bg: 'bg-slate-500',  ring: 'ring-slate-400',  text: 'text-slate-400'  },
];

const COLOR_ICON_MAP = {
  teal:    'text-teal-400',
  violet:  'text-violet-400',
  amber:   'text-amber-400',
  rose:    'text-rose-400',
  sky:     'text-sky-400',
  emerald: 'text-emerald-400',
  orange:  'text-orange-400',
  slate:   'text-slate-400',
};

export function CreateFolderModal({ isOpen, onClose, onFolderCreated }) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState('teal');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setSelectedColor('teal');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Folder name cannot be empty.');
      return;
    }
    if (trimmed.length > 80) {
      setError('Folder name must be 80 characters or fewer.');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/media/folders', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ name: trimmed, color: selectedColor }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create folder.');
        return;
      }

      onFolderCreated?.(data.folder);
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const iconColor = COLOR_ICON_MAP[selectedColor] || 'text-teal-400';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Folder"
      subtitle="Organise your media library with folders"
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Folder Preview */}
        <div className="flex items-center justify-center py-2">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
            <Folder className={`w-8 h-8 ${iconColor} fill-current opacity-80`} />
          </div>
        </div>

        {/* Folder Name Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 block">Folder Name</label>
          <input
            ref={inputRef}
            id="folder-name-input"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="e.g. Brand Assets"
            maxLength={80}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/40 transition-colors"
          />
          {error && (
            <p className="text-xs text-rose-400 font-medium mt-1">{error}</p>
          )}
        </div>

        {/* Color Picker */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">Folder Color</label>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                id={`folder-color-${c.id}`}
                title={c.label}
                onClick={() => setSelectedColor(c.id)}
                className={`w-7 h-7 rounded-full ${c.bg} transition-all duration-150 focus:outline-none ${
                  selectedColor === c.id
                    ? `ring-2 ring-offset-2 ring-offset-slate-900 ${c.ring} scale-110`
                    : 'opacity-60 hover:opacity-100 hover:scale-105'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={FolderPlus}
            isLoading={isCreating}
            disabled={!name.trim() || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Folder'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
