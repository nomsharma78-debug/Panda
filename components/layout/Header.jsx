'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  KeyRound,
  CreditCard,
  FileText,
  Upload,
  HardDrive,
  Menu,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/context/AuthContext';

export function Header({
  title,
  subtitle,
  onOpenMobileMenu,
  onOpenUpload,
  onOpenAddVaultItem,
  onOpenAddStorage,
  onSearch,
  searchPlaceholder = 'Search in Panda...',
}) {
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  const handleSearchChange = (e) => {
    const v = e.target.value;
    setSearchVal(v);
    if (onSearch) onSearch(v);
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-4 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800"
          aria-label="Open mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
            {title}
          </h1>
          {subtitle && <p className="text-xs text-slate-400 font-normal hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        {onSearch && (
          <div className="relative hidden sm:block w-64 md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchVal}
              onChange={handleSearchChange}
              placeholder={searchPlaceholder}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
        )}

        {/* Global Create / Upload Dropdown */}
        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span className="hidden sm:inline">New</span>
          </Button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-modal p-1.5 z-40 animate-slide-up space-y-1 text-xs">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onOpenUpload) onOpenUpload();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-200 hover:bg-slate-800 hover:text-teal-300 transition-colors text-left font-medium"
                >
                  <Upload className="w-4 h-4 text-teal-400" />
                  <span>Upload Media / File</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onOpenAddVaultItem) onOpenAddVaultItem('login');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-200 hover:bg-slate-800 hover:text-teal-300 transition-colors text-left font-medium"
                >
                  <KeyRound className="w-4 h-4 text-cyan-400" />
                  <span>New Password</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onOpenAddVaultItem) onOpenAddVaultItem('card');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-200 hover:bg-slate-800 hover:text-teal-300 transition-colors text-left font-medium"
                >
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  <span>New Payment Card</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onOpenAddVaultItem) onOpenAddVaultItem('note');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-200 hover:bg-slate-800 hover:text-teal-300 transition-colors text-left font-medium"
                >
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>New Secure Note</span>
                </button>

                <div className="border-t border-slate-800 my-1 pt-1" />

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onOpenAddStorage) onOpenAddStorage();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-200 hover:bg-slate-800 hover:text-teal-300 transition-colors text-left font-medium"
                >
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  <span>Connect Storage</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
