import React from 'react';

export function Badge({
  children,
  variant = 'default', // 'default' | 'teal' | 'emerald' | 'amber' | 'rose' | 'indigo'
  size = 'md', // 'sm' | 'md'
  className = '',
}) {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
  };

  const variantStyles = {
    default: 'bg-slate-800 text-slate-300 border-slate-700',
    teal: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
