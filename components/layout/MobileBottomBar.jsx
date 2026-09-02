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
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <nav
        aria-label="Mobile Bottom Navigation"
        className="pointer-events-auto max-w-md mx-auto bg-slate-900/65 backdrop-blur-2xl backdrop-saturate-150 border border-white/[0.12] rounded-3xl shadow-[0_12px_40px_-5px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] px-2 py-1.5 flex items-center justify-between"
      >
        {navItems.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-1 transition-all duration-200 active:scale-90 group"
            >
              <div
                className={`w-10 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${
                  active
                    ? 'bg-teal-500/15 text-teal-400 shadow-[0_0_12px_rgba(20,184,166,0.25)]'
                    : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                <Icon
                  className="w-5 h-5 transition-transform duration-200"
                  strokeWidth={active ? 2.4 : 1.8}
                />
              </div>

              <span
                className={`text-[10px] tracking-tight mt-0.5 transition-colors ${
                  active
                    ? 'font-semibold text-teal-300'
                    : 'font-medium text-slate-400 group-hover:text-slate-300'
                }`}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
