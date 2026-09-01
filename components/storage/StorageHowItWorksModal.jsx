'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, Cloud, Database, Lock, ArrowRight, HardDrive, CheckCircle2 } from 'lucide-react';

export function StorageHowItWorksModal({ isOpen, onClose, onOpenConnect }) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="How Cloud Storage Works in Panda"
      description="Learn how Panda keeps your files private, encrypted, and in your direct control."
      size="lg"
    >
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
        {/* Architecture Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-teal-400 font-semibold text-xs">
              <Database className="w-4 h-4" />
              <span>1. Panda Database (PostgreSQL)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Stores your account profile, encrypted vault credentials (passwords, cards, notes), and lightweight media metadata (filenames, dimensions, file size, timestamps).
            </p>
            <div className="text-[11px] text-teal-400/80 font-mono">
              ✓ Ready immediately with zero setup
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-teal-500/30 space-y-2">
            <div className="flex items-center gap-2 text-teal-300 font-semibold text-xs">
              <Cloud className="w-4 h-4" />
              <span>2. Your External Cloud Storage</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Stores raw heavy media files (photos, 4K videos, PDFs, documents) in your own Cloudflare R2, Backblaze B2, or Amazon S3 buckets.
            </p>
            <div className="text-[11px] text-teal-300/80 font-mono">
              ✓ Full data ownership & zero lock-in
            </div>
          </div>
        </div>

        {/* 3 Core Guarantees */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
            Key Privacy Guarantees
          </h4>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-white">AES-256-GCM File & Credential Encryption</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Credentials and media payloads are encrypted with random 12-byte IVs and authenticated tags before transmission to storage.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-start gap-3">
            <Lock className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-white">Never Stored in PostgreSQL</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Large binary files never touch the SQL database, ensuring blazing performance and database scalability.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-start gap-3">
            <HardDrive className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-white">Unified Multi-Provider Experience</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Connect multiple buckets (e.g. personal R2 + work B2) and browse all your memories in a single seamless chronological library.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between border-t border-slate-800">
          <Button variant="ghost" size="md" onClick={onClose}>
            Close
          </Button>

          {onOpenConnect && (
            <Button
              variant="primary"
              size="md"
              icon={ArrowRight}
              onClick={() => {
                onClose();
                onOpenConnect();
              }}
            >
              Connect Cloud Storage
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
