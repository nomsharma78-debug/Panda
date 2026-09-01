'use client';

import React, { useState } from 'react';
import { Folder, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { formatBytes } from '@/components/ui/Progress';

const COLOR_STYLES = {
  teal: { bg: 'bg-teal-500/10 hover:bg-teal-500/15', icon: 'text-teal-400', border: 'border-teal-500/20 hover:border-teal-500/40' },
  blue: { bg: 'bg-blue-500/10 hover:bg-blue-500/15', icon: 'text-blue-400', border: 'border-blue-500/20 hover:border-blue-500/40' },
  indigo: { bg: 'bg-indigo-500/10 hover:bg-indigo-500/15', icon: 'text-indigo-400', border: 'border-indigo-500/20 hover:border-indigo-500/40' },
  purple: { bg: 'bg-purple-500/10 hover:bg-purple-500/15', icon: 'text-purple-400', border: 'border-purple-500/20 hover:border-purple-500/40' },
  amber: { bg: 'bg-amber-500/10 hover:bg-amber-500/15', icon: 'text-amber-400', border: 'border-amber-500/20 hover:border-amber-500/40' },
  emerald: { bg: 'bg-emerald-500/10 hover:bg-emerald-500/15', icon: 'text-emerald-400', border: 'border-emerald-500/20 hover:border-emerald-500/40' },
  rose: { bg: 'bg-rose-500/10 hover:bg-rose-500/15', icon: 'text-rose-400', border: 'border-rose-500/20 hover:border-rose-500/40' },
};

export function FolderCard({ folder, onOpen, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const colorStyle = COLOR_STYLES[folder.color] || COLOR_STYLES.teal;

  const fileCount = folder.file_count || 0;
  const totalBytes = folder.total_bytes ? formatBytes(folder.total_bytes) : '0 B';

  return (
    <div
      onClick={() => onOpen(folder)}
      className={`group relative p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 shadow-card ${colorStyle.bg} ${colorStyle.border}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shrink-0 group-hover:scale-105 transition-transform ${colorStyle.icon}`}>
          <Folder className="w-5 h-5 fill-current/20" />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-white tracking-tight truncate group-hover:text-teal-300 transition-colors">
            {folder.name}
          </h4>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            {fileCount} {fileCount === 1 ? 'file' : 'files'} {fileCount > 0 && `• ${totalBytes}`}
          </p>
        </div>
      </div>

      {/* Action Menu */}
      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-8 z-30 w-36 rounded-2xl bg-slate-900 border border-slate-800 p-1 shadow-modal space-y-0.5 animate-slide-up"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRename(folder);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-left"
            >
              <Edit2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Rename</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDelete(folder);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-left"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
