import React, { useState } from 'react';

/**
 * Panda Brand Logo & Wordmark
 * Premium cyber-shield panda vault mark with unified vector & image fallback.
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
        className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-teal-500/30 shadow-glow-teal p-1 overflow-hidden shrink-0 ${className}`}
      >
        {!imageError ? (
          <img
            src="/icon.jpg"
            alt="Panda Vault Logo"
            className="w-full h-full object-cover rounded-xl"
            onError={() => setImageError(true)}
          />
        ) : (
          /* Unified Vector SVG Cyber Shield Logo */
          <svg
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            {/* Cyber Shield */}
            <path
              d="M24 6 L8 12 V24 C8 33 15 39 24 42 C33 39 40 33 40 24 V12 L24 6 Z"
              fill="#0f172a"
              stroke="#14b8a6"
              strokeWidth="2"
            />
            {/* Ears */}
            <circle cx="15" cy="13" r="3.5" fill="#14b8a6" />
            <circle cx="33" cy="13" r="3.5" fill="#14b8a6" />
            {/* Panda Face Base */}
            <path
              d="M13 22 C13 16 18 13 24 13 C30 13 35 16 35 22 C35 28 30 32 24 32 C18 32 13 28 13 22 Z"
              fill="#1e293b"
              stroke="#38bdf8"
              strokeWidth="1.5"
            />
            {/* Eyes */}
            <ellipse cx="18" cy="21" rx="2.5" ry="2" transform="rotate(-15 18 21)" fill="#0f172a" stroke="#14b8a6" strokeWidth="1" />
            <circle cx="18" cy="21" r="1" fill="#38bdf8" />
            <ellipse cx="30" cy="21" rx="2.5" ry="2" transform="rotate(15 30 21)" fill="#0f172a" stroke="#14b8a6" strokeWidth="1" />
            <circle cx="30" cy="21" r="1" fill="#38bdf8" />
            {/* Keyhole Dial Core */}
            <circle cx="24" cy="25" r="4" fill="#020617" stroke="#38bdf8" strokeWidth="1.5" />
            <path d="M22.5 23.5 H25.5 V26 L26 27 H22 L22.5 26 Z" fill="#14b8a6" />
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
            <span className="text-[10px] uppercase font-mono tracking-widest px-1.5 py-0.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 font-semibold">
              Vault
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium tracking-tight">
            Your private digital space
          </span>
        </div>
      )}
    </div>
  );
}
