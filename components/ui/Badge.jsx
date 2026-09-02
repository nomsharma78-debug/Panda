import React from 'react';

export function Badge({
  children,
  variant = 'default', // 'default' | 'teal' | 'emerald' | 'amber' | 'rose' | 'indigo'
  size = 'md', // 'sm' | 'md'
  className = '',
}) {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-0.5 text-xs',
  };

  const variantStyles = {
    default: 'bg-slate-800/80 text-slate-300 border-slate-700/60',
    teal: 'bg-teal-500/10 text-teal-300 border-teal-500/25 shadow-[0_0_8px_rgba(20,184,166,0.15)]',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25 shadow-[0_0_8px_rgba(16,185,129,0.15)]',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/25 shadow-[0_0_8px_rgba(245,158,11,0.15)]',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/25 shadow-[0_0_8px_rgba(244,63,94,0.15)]',
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25 shadow-[0_0_8px_rgba(99,102,241,0.15)]',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border tracking-tight ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
