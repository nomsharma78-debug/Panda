'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShieldCheck,
  Film,
  HardDrive,
  Settings,
} from 'lucide-react';

export function MobileBottomBar() {
  const pathname = usePathname();

  const navItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      isActive: (path) => path === '/dashboard' || path === '/',
    },
    {
      name: 'Vault',
      href: '/vault',
      icon: ShieldCheck,
      isActive: (path) => path.startsWith('/vault'),
    },
    {
      name: 'Media',
      href: '/media',
      icon: Film,
      isActive: (path) => path.startsWith('/media'),
    },
    {
      name: 'Storage',
      href: '/storage',
      icon: HardDrive,
      isActive: (path) => path.startsWith('/storage'),
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      isActive: (path) => path.startsWith('/settings'),
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/75 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-10px_35px_rgba(0,0,0,0.6)] px-3 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]"
    >
      <div className="max-w-lg mx-auto flex items-center justify-around gap-1">
        {navItems.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1.5 rounded-2xl transition-all duration-200 active:scale-95 relative group ${
                active
                  ? 'text-teal-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {/* Glass Pill Glow Background for Active Item */}
              {active && (
                <span className="absolute inset-0 bg-teal-500/10 border border-teal-500/25 rounded-2xl shadow-[0_0_14px_rgba(20,184,166,0.2)] -z-10" />
              )}

              {/* Icon Container with subtle glow */}
              <div className="relative flex items-center justify-center p-0.5">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    active ? 'text-teal-400 scale-110' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                  strokeWidth={active ? 2.3 : 1.8}
                />
                {active && (
                  <span className="absolute -top-1 w-1 h-1 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,1)]" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] mt-0.5 tracking-tight transition-colors ${
                  active ? 'font-bold text-teal-300' : 'font-medium text-slate-400'
                }`}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
