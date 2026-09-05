import React from 'react';
import { formatBytes } from '@/lib/utils/formatters';

export { formatBytes };

export function Progress({
  value = 0,
  max = 100,
  variant = 'teal', // 'teal' | 'emerald' | 'amber' | 'rose'
  size = 'md', // 'sm' | 'md' | 'lg'
  showLabel = false,
  className = '',
}) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const sizeStyles = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  };

  const variantStyles = {
    teal: 'bg-gradient-to-r from-teal-500 via-teal-400 to-cyan-400 shadow-[0_0_12px_rgba(45,212,191,0.4)]',
    emerald: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]',
    amber: 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]',
    rose: 'bg-gradient-to-r from-rose-500 to-red-400 shadow-[0_0_12px_rgba(244,63,94,0.4)]',
  };

  const formatPercentage = () => {
    if (value > 0 && percentage < 0.01) return '< 0.01%';
    if (value > 0 && percentage < 0.1) return `${percentage.toFixed(2)}%`;
    if (percentage > 0 && percentage < 1) return `${percentage.toFixed(2)}%`;
    return `${percentage.toFixed(1)}%`;
  };

  // Ensure small amounts of data are visually perceptible while maintaining scale
  const visualWidth = value > 0 ? `${Math.max(percentage, 1)}%` : '0%';

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
          <span>Storage Used</span>
          <span className="font-mono text-teal-300 font-semibold">{formatPercentage()}</span>
        </div>
      )}
      <div className={`w-full bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-slate-700/50 ${sizeStyles[size]}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${variantStyles[variant]}`}
          style={{
            width: visualWidth,
            minWidth: value > 0 ? '6px' : '0px',
          }}
        />
      </div>
    </div>
  );
}
