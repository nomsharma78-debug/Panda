import React from 'react';

export function Card({
  children,
  className = '',
  onClick,
  hoverable = false,
  ...props
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-card transition-all duration-200 ${
        hoverable ? 'hover:border-slate-700/90 hover:bg-slate-850 hover:shadow-elevated cursor-pointer hover:-translate-y-0.5' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <div>
        <h4 className="text-sm font-semibold text-white tracking-tight">{title}</h4>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5 tracking-tight">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
