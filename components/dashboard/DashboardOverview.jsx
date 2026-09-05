'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  KeyRound,
  CreditCard,
  FileText,
  Film,
  HardDrive,
  Plus,
  Upload,
  ShieldCheck,
  ArrowRight,
  Cloud,
  Lock,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { MediaLightbox } from '@/components/media/MediaLightbox';
import { MediaCard } from '@/components/media/MediaCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';
import { pandaCache } from '@/lib/client-cache';
import { useCustomEvent } from '@/hooks/useCustomEvent';
import { PANDA_EVENTS } from '@/lib/constants/index';
import { formatBytes } from '@/lib/utils/formatters';

const CACHE_KEY = 'dashboard:overview';
const CACHE_TTL = 120_000; // 2 minutes

function getInitialDashboardData() {
  const cached = pandaCache.get(CACHE_KEY);
  if (cached) return cached;

  // Derive initial values from active sibling caches if available (0ms instant render)
  const cachedVault = pandaCache.get('vault:all');
  const cachedMedia = pandaCache.get('media:list');
  const cachedStorageConns = pandaCache.get('storage:connections');
  const cachedStorageMetrics = pandaCache.get('storage:metrics');

  const vaultStats = { login: 0, card: 0, note: 0, identity: 0, total: 0 };
  if (cachedVault?.items && Array.isArray(cachedVault.items)) {
    cachedVault.items.forEach((item) => {
      const t = (item.type || '').toLowerCase();
      if (vaultStats[t] !== undefined) vaultStats[t]++;
      vaultStats.total++;
    });
  }

  const mediaList = Array.isArray(cachedMedia) ? cachedMedia : [];
  const connections = cachedStorageConns?.connections || [];
  const storage = cachedStorageMetrics || cachedStorageConns?.combined || {
    usedBytes: 0,
    totalBytes: 10737418240,
    providerCount: connections.length,
  };

  return {
    vault: vaultStats,
    media: {
      total: mediaList.length,
      images: mediaList.filter((m) => m.media_type === 'photo' || m.media_type === 'image').length,
      videos: mediaList.filter((m) => m.media_type === 'video').length,
      documents: mediaList.filter((m) => m.media_type === 'document' || m.media_type === 'pdf').length,
      totalBytes: 0,
    },
    storage: {
      ...storage,
      providerCount: connections.length || storage.providerCount || 0,
    },
    recentMedia: mediaList.slice(0, 6),
    recentActivity: [],
  };
}

function MovingDots({ color = 'bg-teal-400 text-teal-400' }) {
  return (
    <div className="flex items-center gap-1.5 py-1.5 h-8">
      <span className={`w-2 h-2 rounded-full ${color} animate-bounce [animation-delay:-0.32s] shadow-sm`} />
      <span className={`w-2 h-2 rounded-full ${color} animate-bounce [animation-delay:-0.16s] shadow-sm`} />
      <span className={`w-2 h-2 rounded-full ${color} animate-bounce shadow-sm`} />
    </div>
  );
}

export function DashboardOverview({
  onOpenUpload,
  onOpenAddVaultItem,
  onOpenAddStorage,
}) {
  const { user, session } = useAuth();
  const { success, error: toastError } = useToast();

  // Instant 0ms state initialization
  const [data, setData] = useState(getInitialDashboardData);
  const [loading, setLoading] = useState(!pandaCache.get(CACHE_KEY));

  // Lightbox state for recent media
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDashboardData = useCallback(
    async (force = false) => {
      if (!force) {
        const cached = pandaCache.get(CACHE_KEY);
        if (cached) {
          setData(cached);
          setLoading(false);
          return;
        }
      }

      try {
        const headers = { 'Cache-Control': 'no-cache' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/dashboard', { headers, credentials: 'include' });
        if (res.ok) {
          const dashboardData = await res.json();
          const conns = dashboardData.storage?.connections || [];
          if (dashboardData.storage) {
            dashboardData.storage.providerCount = Math.max(
              dashboardData.storage.providerCount || 0,
              conns.length
            );
          }
          pandaCache.set(CACHE_KEY, dashboardData, CACHE_TTL);
          if (dashboardData.storage) {
            pandaCache.set('storage:metrics', dashboardData.storage, CACHE_TTL);
          }
          setData(dashboardData);
        }
      } catch (e) {
        console.error('Failed to load dashboard data:', e);
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token]
  );

  // Background SWR fetch on mount and session change
  useEffect(() => {
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  // Silent reactive updates on events
  const handleUpdate = useCallback(() => {
    pandaCache.invalidate(CACHE_KEY);
    fetchDashboardData(true);
  }, [fetchDashboardData]);

  useCustomEvent(PANDA_EVENTS.VAULT_UPDATED, handleUpdate);
  useCustomEvent(PANDA_EVENTS.STORAGE_UPDATED, handleUpdate);
  useCustomEvent(PANDA_EVENTS.MEDIA_UPLOADED, handleUpdate);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Resilient recent media items resolver (combines API data + memory cache)
  const recentMediaItems = useMemo(() => {
    if (data?.recentMedia && Array.isArray(data.recentMedia) && data.recentMedia.length > 0) {
      return data.recentMedia;
    }
    const cachedMedia = pandaCache.get('media:list');
    if (Array.isArray(cachedMedia) && cachedMedia.length > 0) {
      return cachedMedia.slice(0, 6);
    }
    return [];
  }, [data?.recentMedia]);

  const statCards = useMemo(
    () => [
      {
        title: 'Passwords',
        count: data?.vault?.login ?? 0,
        icon: KeyRound,
        href: '/vault?type=login',
        color: 'text-teal-400 bg-teal-500/10 border-teal-500/25',
        dotColor: 'bg-teal-400 text-teal-400',
        subtitle: 'Encrypted in Database',
      },
      {
        title: 'Payment Cards',
        count: data?.vault?.card ?? 0,
        icon: CreditCard,
        href: '/vault?type=card',
        color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
        dotColor: 'bg-indigo-400 text-indigo-400',
        subtitle: 'Encrypted in Database',
      },
      {
        title: 'Secure Notes',
        count: data?.vault?.note ?? 0,
        icon: FileText,
        href: '/vault?type=note',
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
        dotColor: 'bg-emerald-400 text-emerald-400',
        subtitle: 'Encrypted in Database',
      },
      {
        title: 'Media Files',
        count: Math.max(data?.media?.total ?? 0, recentMediaItems.length),
        icon: Film,
        href: '/media',
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
        dotColor: 'bg-amber-400 text-amber-400',
        subtitle: 'In Cloud Storage',
      },
    ],
    [data?.vault, data?.media, recentMediaItems.length]
  );

  const hasStorage = Boolean(
    (data?.storage?.providerCount && data.storage.providerCount > 0) ||
    (data?.storage?.connections && data.storage.connections.length > 0)
  );

  const executeDelete = async () => {
    if (!deleteTarget?.id) return;
    setIsDeleting(true);
    setLightboxOpen(false);
    try {
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/media/${deleteTarget.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        success(`Deleted "${deleteTarget.original_filename}"`);
        pandaCache.removeMediaItem(deleteTarget.id);
        pandaCache.invalidate(CACHE_KEY);
        setData((prev) => ({
          ...prev,
          recentMedia: (prev.recentMedia || []).filter((m) => m.id !== deleteTarget.id),
          media: {
            ...prev.media,
            total: Math.max(0, (prev.media?.total || 1) - 1),
          },
        }));
        window.dispatchEvent(new CustomEvent(PANDA_EVENTS.STORAGE_UPDATED));
      } else {
        toastError('Failed to delete file');
      }
    } catch {
      toastError('Network error deleting file');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* Top Banner Greeting */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800/90 rounded-2xl sm:rounded-3xl p-5 sm:p-7 md:p-8 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1.5 sm:space-y-2 relative z-10">
          <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-mono font-semibold uppercase tracking-wider text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-full w-fit">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Encrypted Personal Vault</span>
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight">
            {getGreeting()}, {user?.name || (user?.email ? user.email.split('@')[0] : 'there')}!
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-lg leading-relaxed">
            Your login credentials, cards, and notes are encrypted in Panda&apos;s database. Media files are securely stored in your connected cloud object storage.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap relative z-10">
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() => onOpenAddVaultItem('login')}
            className="rounded-xl"
          >
            New Password
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={hasStorage ? Upload : Cloud}
            onClick={hasStorage ? onOpenUpload : onOpenAddStorage}
            className="rounded-xl"
          >
            {hasStorage ? 'Upload Media' : 'Connect Storage'}
          </Button>
        </div>
      </div>

      {/* Zero Storage Onboarding Banner if not yet connected */}
      {!hasStorage && !loading && (
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-teal-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-card">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 shrink-0 mt-0.5">
              <Cloud className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white tracking-tight">Connect cloud storage to unlock your media library</h4>
              <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                Vault passwords, cards, and notes are ready immediately. To upload photos, videos, and documents, connect your Cloudflare R2, Backblaze B2, or Amazon S3 bucket.
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={onOpenAddStorage}
            className="shrink-0"
          >
            Connect Cloud Storage
          </Button>
        </div>
      )}

      {/* 4 Stat Overview Cards (0ms Instant Display) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.title}
              href={stat.href}
              className="bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 group block"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 sm:p-2.5 rounded-xl border ${stat.color} shadow-subtle`}>
                  <Icon className="w-4 h-4" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-xs font-medium text-slate-400 tracking-tight">{stat.title}</p>
              {loading && !pandaCache.get(CACHE_KEY) ? (
                <MovingDots color={stat.dotColor} />
              ) : (
                <h3 className="text-2xl font-bold text-white mt-0.5 tracking-tight font-mono animate-fade-in">
                  {stat.count}
                </h3>
              )}
              <p className="text-[10px] text-slate-400 font-mono mt-1">{stat.subtitle}</p>
            </Link>
          );
        })}
      </div>

      {/* Main 2-Column Split: Storage Indicator & Recent Media */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Storage Widget (1 Column) */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-5 sm:p-6 shadow-card flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white tracking-tight">
                <HardDrive className="w-4 h-4 text-teal-400" />
                <span>Object Storage</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUpdate}
                  className="text-slate-400 hover:text-teal-300 p-1 rounded-lg hover:bg-slate-800/60 transition-colors"
                  title="Refresh storage quota"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
                </button>
                <Link href="/storage" className="text-xs text-teal-400 hover:text-teal-300 transition-colors font-medium">
                  Manage
                </Link>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Unified capacity across all connected external cloud buckets.
            </p>

            {(() => {
              const liveUsed = Math.max(Number(data?.storage?.usedBytes || 0), Number(data?.media?.totalBytes || 0));
              const liveTotal = Number(data?.storage?.totalBytes) || 10737418240;
              const liveAvail = Math.max(0, liveTotal - liveUsed);
              const livePct = liveTotal > 0 ? (liveUsed / liveTotal) * 100 : 0;
              const connCount = Number(data?.storage?.providerCount) || (data?.storage?.connections || []).length || 0;

              return (
                <div className="space-y-2.5 bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80">
                  <div className="flex justify-between items-center text-xs text-slate-200 font-medium">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                      <span>{formatBytes(liveUsed)} used</span>
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {formatBytes(liveTotal)} Total
                    </span>
                  </div>

                  <Progress
                    value={liveUsed}
                    max={liveTotal}
                    size="md"
                    variant={livePct > 90 ? 'rose' : livePct > 75 ? 'amber' : 'teal'}
                  />

                  <div className="flex items-center justify-between text-[11px] pt-0.5">
                    <span className="text-slate-400 font-mono">
                      {formatBytes(liveAvail)} Free
                    </span>
                    <span className="text-teal-400 font-mono font-semibold">
                      {liveUsed === 0
                        ? '0.0%'
                        : livePct < 0.01
                        ? '< 0.01%'
                        : livePct < 1
                        ? `${livePct.toFixed(2)}%`
                        : `${livePct.toFixed(1)}%`}
                    </span>
                  </div>

                  <div className="border-t border-slate-800/60 pt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{connCount} connected bucket{connCount !== 1 ? 's' : ''}</span>
                    <span className="text-emerald-400 font-mono flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Encrypted at rest</span>
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          <Button
            variant={hasStorage ? 'secondary' : 'primary'}
            size="sm"
            icon={hasStorage ? HardDrive : Plus}
            onClick={onOpenAddStorage}
            className="w-full text-xs"
          >
            {hasStorage ? 'Add Another Bucket' : 'Connect Cloud Storage'}
          </Button>
        </div>

        {/* Recent Media Preview Strip (2 Columns) */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-5 sm:p-6 shadow-card flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white tracking-tight">
              <Film className="w-4 h-4 text-teal-400" />
              <span>Recent Cloud Media</span>
            </div>
            <Link href="/media" className="text-xs text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1 font-medium">
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentMediaItems.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800/80 space-y-2">
              <p className="text-xs text-slate-400">
                {hasStorage
                  ? 'No media files uploaded yet.'
                  : 'Connect your cloud storage to start uploading photos, videos, and documents.'}
              </p>
              <div className="pt-2 flex justify-center">
                <Button
                  variant={hasStorage ? 'primary' : 'secondary'}
                  size="sm"
                  icon={hasStorage ? Upload : Plus}
                  onClick={hasStorage ? onOpenUpload : onOpenAddStorage}
                >
                  {hasStorage ? 'Upload Photo or Video' : 'Connect Storage'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {recentMediaItems.map((m, idx) => (
                <div key={m.id} className="w-full aspect-square">
                  <MediaCard
                    item={m}
                    onClick={() => {
                      setLightboxIndex(idx);
                      setLightboxOpen(true);
                    }}
                    onDelete={(target) => setDeleteTarget(target)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
              <Lock className="w-3.5 h-3.5 text-teal-400" />
              <span>Direct streaming from user cloud storage</span>
            </span>
            <Link href="/media" className="text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1 text-xs font-medium">
              <span>Open Media Gallery</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Lightbox for Recent Media */}
      {recentMediaItems.length > 0 && (
        <MediaLightbox
          mediaList={recentMediaItems}
          currentIndex={lightboxIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          onIndexChange={setLightboxIndex}
          onDelete={(item) => setDeleteTarget(item)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete media file?"
        message="This will permanently delete the encrypted file from your cloud object storage. This action cannot be undone."
        confirmText="Delete permanently"
        confirmVariant="danger"
        isLoading={isDeleting}
        onConfirm={executeDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
