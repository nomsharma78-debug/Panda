import React from 'react';

export function Input({
  label,
  error,
  helperText,
  icon: Icon,
  rightElement,
  className = '',
  id,
  type = 'text',
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-slate-300 flex items-center justify-between tracking-tight">
          <span>{label}</span>
          {helperText && <span className="text-[11px] text-slate-400 font-normal">{helperText}</span>}
        </label>
      )}

      <div className="relative flex items-center">
        {Icon && (
          <div className="absolute left-3.5 pointer-events-none text-slate-400 flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </div>
        )}

        <input
          id={inputId}
          type={type}
          className={`w-full rounded-xl bg-slate-900/90 border ${
            error
              ? 'border-rose-500/70 focus:border-rose-400 focus:ring-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
              : 'border-slate-800 focus:border-teal-500/80 focus:ring-teal-500/15 focus:bg-slate-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]'
          } px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 transition-all duration-150 focus:outline-none focus:ring-2 disabled:opacity-40 disabled:bg-slate-950 ${
            Icon ? 'pl-10' : ''
          } ${rightElement ? 'pr-10' : ''} ${className}`}
          {...props}
        />

        {rightElement && (
          <div className="absolute right-3 flex items-center text-slate-400">
            {rightElement}
          </div>
        )}
      </div>

      {error && <span className="text-xs text-rose-400 font-medium animate-fade-in">{error}</span>}
    </div>
  );
}
