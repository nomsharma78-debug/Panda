import React, { useState } from 'react';

/**
 * Panda Brand Logo & Wordmark
 * Premium cyber-shield panda vault mark.
 */
export function PandaLogo({
  className = 'w-9 h-9',
  showWordmark = true,
  size = 'default',
}) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="flex items-center gap-3 select-none">
      <div
        className={`relative flex items-center justify-center rounded-2xl bg-slate-900 border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.15)] overflow-hidden shrink-0 ${className}`}
      >
        {!imageError ? (
          <img
            src="/icon.jpg"
            alt="Panda Vault"
            className="w-full h-full object-cover rounded-xl"
            onError={() => setImageError(true)}
          />
        ) : (
          /* Fallback Cyber Shield SVG */
          <svg
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full p-1"
          >
            <path
              d="M24 6 L8 12 V24 C8 33 15 39 24 42 C33 39 40 33 40 24 V12 L24 6 Z"
              fill="#0e1118"
              stroke="#2dd4bf"
              strokeWidth="2"
            />
            <circle cx="16" cy="15" r="3.5" fill="#2dd4bf" />
            <circle cx="32" cy="15" r="3.5" fill="#2dd4bf" />
            <circle cx="24" cy="25" r="8" fill="#131722" stroke="#2dd4bf" strokeWidth="1.5" />
            <circle cx="20" cy="23" r="1.5" fill="#5eead4" />
            <circle cx="28" cy="23" r="1.5" fill="#5eead4" />
            <path d="M22 28 C23 29.5 25 29.5 26 28" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {showWordmark && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-bold tracking-tight text-white ${
                size === 'lg' ? 'text-2xl' : 'text-lg'
              }`}
            >
              Panda
            </span>
            <span className="text-[10px] uppercase font-mono tracking-widest px-1.5 py-0.5 rounded-md bg-teal-500/10 border border-teal-500/25 text-teal-300 font-semibold shadow-subtle">
              Vault
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium tracking-tight">
            Encrypted Digital Space
          </span>
        </div>
      )}
    </div>
  );
}
