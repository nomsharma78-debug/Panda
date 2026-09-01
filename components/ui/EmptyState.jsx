import React from 'react';
import { Button } from './Button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl bg-slate-900/40 border border-slate-800/80 ${className}`}>
      {Icon && (
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-teal-400 mb-4 shadow-sm">
          <Icon className="w-7 h-7" />
        </div>
      )}
      <h3 className="text-base font-semibold text-white tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-sm mt-1.5 mb-6 font-normal">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} icon={actionIcon} variant="primary" size="md">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
