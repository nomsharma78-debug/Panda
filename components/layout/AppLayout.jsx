'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { MobileBottomBar } from './MobileBottomBar';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { MediaUploadModal } from '@/components/media/MediaUploadModal';
import { AddVaultItemModal } from '@/components/vault/AddVaultItemModal';
import { AddStorageModal } from '@/components/storage/AddStorageModal';

import { pandaCache } from '@/lib/client-cache';

const METRICS_CACHE_KEY = 'storage:metrics';

export function AppLayout({
  children,
  title = 'Panda Vault',
  subtitle = null,
  onSearch = null,
  searchPlaceholder = 'Search in Panda...',
}) {
  const { user, session, loading } = useAuth();
  const router = useRouter();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [addVaultModalOpen, setAddVaultModalOpen] = useState(false);
  const [vaultInitialType, setVaultInitialType] = useState('login');
  const [addStorageModalOpen, setAddStorageModalOpen] = useState(false);

  // Initialize from cache immediately — 0ms render without re-fetching
  const cachedMetrics = pandaCache.get(METRICS_CACHE_KEY) || pandaCache.get('storage:connections')?.combined;
  const [storageMetrics, setStorageMetrics] = useState(cachedMetrics || null);

  // Fetch storage metrics from backend API
  const fetchStorageSummary = async (force = false) => {
    if (!force) {
      const cached = pandaCache.get(METRICS_CACHE_KEY) || pandaCache.get('storage:connections')?.combined;
      if (cached) {
        setStorageMetrics(cached);
      }
    }

    try {
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/storage', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.combined) {
          pandaCache.set(METRICS_CACHE_KEY, data.combined, 120_000);
          pandaCache.set('storage:connections', data, 120_000);
          setStorageMetrics(data.combined);
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (user) {
      fetchStorageSummary(false);
    }
  }, [user, loading, router]);

  // Real-time listener for storage additions, deletions, and media uploads
  useEffect(() => {
    const handleStorageUpdated = () => {
      pandaCache.invalidate(METRICS_CACHE_KEY);
      pandaCache.invalidate('storage:connections');
      fetchStorageSummary(true);
    };
    window.addEventListener('panda:storage:updated', handleStorageUpdated);
    window.addEventListener('panda:media:uploaded', handleStorageUpdated);
    return () => {
      window.removeEventListener('panda:storage:updated', handleStorageUpdated);
      window.removeEventListener('panda:media:uploaded', handleStorageUpdated);
    };
  }, []);

  const handleOpenAddVaultItem = (type = 'login') => {
    setVaultInitialType(type);
    setAddVaultModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-400">
        <div className="flex items-center gap-2.5 text-xs text-slate-500 font-mono animate-fade-in">
          <div className="w-4 h-4 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
          <span>Opening vault...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-400">
        <div className="flex items-center gap-2.5 text-xs text-slate-500 font-mono animate-fade-in">
          <div className="w-4 h-4 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
          <span>Redirecting to login...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Desktop Sidebar */}
      <Sidebar storageMetrics={storageMetrics} />

      {/* Mobile Drawer */}
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        <Header
          title={title}
          subtitle={subtitle}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenUpload={() => setUploadModalOpen(true)}
          onOpenAddVaultItem={handleOpenAddVaultItem}
          onOpenAddStorage={() => setAddStorageModalOpen(true)}
          onSearch={onSearch}
          searchPlaceholder={searchPlaceholder}
        />

        <main className="flex-1 p-4 sm:p-8 pb-28 md:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* iOS / Instagram Style Floating Glass Mobile Bottom Bar */}
      <MobileBottomBar />

      {/* Global Modals */}
      <MediaUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadSuccess={() => {
          fetchStorageSummary();
          window.dispatchEvent(new CustomEvent('panda:media:uploaded'));
        }}
      />

      <AddVaultItemModal
        isOpen={addVaultModalOpen}
        onClose={() => setAddVaultModalOpen(false)}
        initialType={vaultInitialType}
        onItemCreated={() => {
          window.dispatchEvent(new CustomEvent('panda:vault:updated'));
        }}
      />

      <AddStorageModal
        isOpen={addStorageModalOpen}
        onClose={() => setAddStorageModalOpen(false)}
        onStorageAdded={() => {
          fetchStorageSummary();
          window.dispatchEvent(new CustomEvent('panda:storage:updated'));
        }}
      />
    </div>
  );
}
