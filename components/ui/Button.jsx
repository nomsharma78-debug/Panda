import React from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size = 'md', // 'sm' | 'md' | 'lg'
  isLoading = false,
  disabled = false,
  className = '',
  icon: Icon,
  type = 'button',
  onClick,
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-40 disabled:pointer-events-none select-none active:scale-[0.98] tracking-tight';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5 font-medium',
    md: 'px-4 py-2 text-xs sm:text-sm gap-2 font-semibold',
    lg: 'px-5 py-2.5 text-sm sm:text-base gap-2.5 font-semibold',
  };

  const variantStyles = {
    primary:
      'bg-gradient-to-b from-teal-400 to-teal-500 hover:from-teal-300 hover:to-teal-400 text-slate-950 font-semibold shadow-[0_2px_12px_rgba(20,184,166,0.35),inset_0_1px_0_rgba(255,255,255,0.3)] focus:ring-teal-400 border border-teal-300/30',
    secondary:
      'bg-slate-800/90 hover:bg-slate-750 text-slate-200 border border-slate-700/80 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-slate-600 focus:ring-slate-500',
    outline:
      'bg-transparent border border-slate-700/80 hover:border-slate-600 text-slate-300 hover:text-white hover:bg-slate-800/40 focus:ring-slate-500',
    danger:
      'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 hover:border-rose-500/50 shadow-[0_1px_3px_rgba(0,0,0,0.2)] focus:ring-rose-400',
    ghost:
      'bg-transparent hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 focus:ring-slate-500',
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : Icon ? (
        <Icon className="w-4 h-4 shrink-0" />
      ) : null}
      {children}
    </button>
  );
}
