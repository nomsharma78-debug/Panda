'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import { PROVIDER_METADATA } from '@/lib/storage/provider-metadata';

export { PROVIDER_METADATA };

export function StorageProviderInstructionsModal({ isOpen, onClose, providerId }) {
  const meta = PROVIDER_METADATA[providerId] || PROVIDER_METADATA.r2;

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`How to connect ${meta.name}`}
      description="Follow these step-by-step instructions to get your credentials."
      size="lg"
    >
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
        {/* Dashboard Link if applicable */}
        {meta.dashboardUrl && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs">
            <span className="font-medium">Ready to open your provider console?</span>
            <a
              href={meta.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold transition-all shrink-0"
            >
              <span>Open {meta.name}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Step-by-Step Cards */}
        <div className="space-y-3">
          {meta.steps.map((step, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-start gap-3.5"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-slate-800 text-teal-400 font-bold text-xs shrink-0 mt-0.5 border border-slate-700">
                {idx + 1}
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-white tracking-tight">{step.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Security Warning */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-amber-200">
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
            <span>Panda Zero-Plaintext Security Guarantee</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Your Secret Access Key is <strong>never stored in plaintext</strong> and <strong>never returned to the browser</strong>.
            Panda encrypts your credentials using server-side <strong>AES-256-GCM</strong> authenticated encryption before saving.
          </p>
        </div>

        <div className="pt-2 flex justify-end">
          <Button variant="primary" size="md" onClick={onClose}>
            Got it, Connect {meta.name}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
