'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  KeyRound,
  CreditCard,
  FileText,
  UserCheck,
  Film,
  HardDrive,
  Settings,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { PandaLogo } from '@/components/ui/PandaLogo';
import { useAuth } from '@/components/context/AuthContext';
import { Progress, formatBytes } from '@/components/ui/Progress';

export function Sidebar({ storageMetrics = null }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    {
      name: 'Vault',
      href: '/vault',
      icon: ShieldCheck,
      children: [
        { name: 'Passwords', href: '/vault?type=login', icon: KeyRound },
        { name: 'Cards', href: '/vault?type=card', icon: CreditCard },
        { name: 'Notes', href: '/vault?type=note', icon: FileText },
        { name: 'Identities', href: '/vault?type=identity', icon: UserCheck },
      ],
    },
    { name: 'Media Library', href: '/media', icon: Film },
    { name: 'Storage Hub', href: '/storage', icon: HardDrive },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isActive = (href) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
    if (href === '/vault') return pathname.startsWith('/vault');
    if (href.startsWith('/vault?')) return pathname === '/vault';
    return pathname.startsWith(href);
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 bg-slate-950/95 border-r border-slate-800/80 z-30 select-none backdrop-blur-xl">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80 bg-slate-950/50">
        <Link href="/dashboard" className="block focus:outline-none focus:ring-2 focus:ring-teal-500/50 rounded-2xl">
          <PandaLogo size="default" />
        </Link>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <div key={item.name} className="space-y-1">
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 relative group ${
                  active
                    ? 'bg-slate-900 text-teal-300 font-semibold border border-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.3)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]" />
                )}
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    active ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-300'
                  }`}
                />
                <span className="tracking-tight">{item.name}</span>
              </Link>

              {/* Sub-items for Vault */}
              {item.children && active && (
                <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-slate-800 ml-5 my-1 animate-fade-in">
                  {item.children.map((sub) => {
                    const SubIcon = sub.icon;
                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-teal-300 hover:bg-slate-900/50 transition-colors"
                      >
                        <SubIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>{sub.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer: Combined Storage Meter & User Profile */}
      <div className="p-4 border-t border-slate-800/80 space-y-3 bg-slate-950/80">
        {/* Storage Quick Widget */}
        <Link
          href="/storage"
          className="block p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-all group shadow-subtle"
        >
          <div className="flex items-center justify-between text-xs font-medium mb-1.5">
            <span className="text-slate-300 flex items-center gap-1.5 font-semibold tracking-tight">
              <HardDrive className="w-3.5 h-3.5 text-teal-400" />
              <span>Storage</span>
            </span>
            <span className="text-slate-400 group-hover:text-teal-300 text-[11px] font-mono">
              {storageMetrics && storageMetrics.providerCount > 0
                ? storageMetrics.totalBytes
                  ? `${formatBytes(storageMetrics.usedBytes)} / ${formatBytes(storageMetrics.totalBytes)}`
                  : `${formatBytes(storageMetrics.usedBytes)} stored`
                : 'Not Connected'}
            </span>
          </div>
          {storageMetrics?.providerCount > 0 && storageMetrics?.totalBytes && (
            <Progress
              value={storageMetrics.usedBytes}
              max={storageMetrics.totalBytes}
              size="sm"
              variant="teal"
            />
          )}
        </Link>

        {/* User Badge & Logout */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-400 to-cyan-500 flex items-center justify-center text-slate-950 font-bold text-xs shrink-0 shadow-[0_0_10px_rgba(20,184,166,0.3)]">
              {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'P'}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-200 truncate tracking-tight">
                {user?.name || user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-[10px] text-slate-400 truncate">{user?.email || 'Encrypted Session'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 transition-colors"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
