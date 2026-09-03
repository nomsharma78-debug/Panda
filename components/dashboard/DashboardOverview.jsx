'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Cloud,
  Lock,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress, formatBytes } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { MediaLightbox } from '@/components/media/MediaLightbox';
import { useAuth } from '@/components/context/AuthContext';
import { pandaCache } from '@/lib/client-cache';

const CACHE_KEY = 'dashboard:overview';
const CACHE_TTL = 30_000; // 30 seconds

export function DashboardOverview({
  onOpenUpload,
  onOpenAddVaultItem,
  onOpenAddStorage,
}) {
  const { user, session } = useAuth();

  // Load from cache immediately — no spinner on revisit
  const cached = pandaCache.get(CACHE_KEY);
  const [data, setData] = useState(cached || null);
  const [loading, setLoading] = useState(!cached);

  // Lightbox state for recent media
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const fetchDashboardData = useCallback(async (force = false) => {
    if (!force && pandaCache.get(CACHE_KEY)) return;

    try {
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const [dashRes, vaultRes] = await Promise.allSettled([
        fetch('/api/dashboard', { headers, credentials: 'include' }),
        fetch('/api/vault', { headers, credentials: 'include' }),
      ]);

      let dashboardData = {};
      if (dashRes.status === 'fulfilled' && dashRes.value.ok) {
        dashboardData = await dashRes.value.json().catch(() => ({}));
      }

      if (vaultRes.status === 'fulfilled' && vaultRes.value.ok) {
        const vaultJson = await vaultRes.value.json().catch(() => ({}));
        const rawItems = vaultJson.items || [];
        const vaultStats = { login: 0, card: 0, note: 0, identity: 0, total: rawItems.length };
        rawItems.forEach((item) => {
          const t = (item.type || '').toLowerCase();
          if (vaultStats[t] !== undefined) {
            vaultStats[t]++;
          }
        });
        dashboardData.vault = vaultStats;
      }

      pandaCache.set(CACHE_KEY, dashboardData, CACHE_TTL);
      setData(dashboardData);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchDashboardData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleUpdated = () => {
      pandaCache.invalidate(CACHE_KEY);
      fetchDashboardData(true);
    };
    window.addEventListener('panda:vault:updated', handleUpdated);
    window.addEventListener('panda:storage:updated', handleUpdated);
    window.addEventListener('panda:media:uploaded', handleUpdated);
    return () => {
      window.removeEventListener('panda:vault:updated', handleUpdated);
      window.removeEventListener('panda:storage:updated', handleUpdated);
      window.removeEventListener('panda:media:uploaded', handleUpdated);
    };
  }, [fetchDashboardData]);



  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const statCards = [
    {
      title: 'Passwords',
      count: data?.vault?.login || 0,
      icon: KeyRound,
      href: '/vault?type=login',
      color: 'text-teal-400 bg-teal-500/10 border-teal-500/25',
      subtitle: 'Encrypted in Database',
    },
    {
      title: 'Payment Cards',
      count: data?.vault?.card || 0,
      icon: CreditCard,
      href: '/vault?type=card',
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
      subtitle: 'Encrypted in Database',
    },
    {
      title: 'Secure Notes',
      count: data?.vault?.note || 0,
      icon: FileText,
      href: '/vault?type=note',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
      subtitle: 'Encrypted in Database',
    },
    {
      title: 'Media Files',
      count: data?.media?.total || 0,
      icon: Film,
      href: '/media',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
      subtitle: 'In Cloud Storage',
    },
  ];

  const hasStorage = (data?.storage?.providerCount || 0) > 0;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* Top Banner Greeting */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800/90 rounded-2xl sm:rounded-3xl p-5 sm:p-7 md:p-8 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6 relative overflow-hidden">
        {/* Subtle Ambient Light Orb */}
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

      {/* 4 Stat Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.title}
              href={stat.href}
              className="bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 sm:p-2.5 rounded-xl border ${stat.color} shadow-subtle`}>
                  <Icon className="w-4 h-4" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-xs font-medium text-slate-400 tracking-tight">{stat.title}</p>
              <h3 className="text-2xl font-bold text-white mt-0.5 tracking-tight">
                {loading ? '...' : stat.count}
              </h3>
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
              <Link href="/storage" className="text-xs text-teal-400 hover:text-teal-300 transition-colors font-medium">
                Manage
              </Link>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Unified capacity across all connected external cloud buckets.
            </p>

            <div className="space-y-2 bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80">
              <div className="flex justify-between text-xs text-slate-200 font-medium">
                <span>{data?.storage ? formatBytes(data.storage.usedBytes) : '0 B'} used</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {data?.storage?.totalBytes ? formatBytes(data.storage.totalBytes) : 'Elastic Cloud'}
                </span>
              </div>
              {data?.storage?.totalBytes && (
                <Progress
                  value={data.storage.usedBytes || 0}
                  max={data.storage.totalBytes}
                  size="md"
                  variant="teal"
                />
              )}
              <p className="text-[11px] text-slate-400 font-mono text-right pt-1">
                {data?.storage?.providerCount || 0} connected provider{data?.storage?.providerCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            icon={HardDrive}
            onClick={onOpenAddStorage}
            className="w-full text-xs"
          >
            Connect Cloud Storage
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

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl bg-slate-950/80 border border-slate-800/50 animate-pulse" />
              ))}
            </div>
          ) : !data?.recentMedia || data.recentMedia.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800/80 space-y-2">
              <p className="text-xs text-slate-400">
                {hasStorage
                  ? 'No media files uploaded yet.'
                  : 'Connect your cloud storage to start uploading photos, videos, and documents.'}
              </p>
              <Button
                variant={hasStorage ? 'primary' : 'secondary'}
                size="sm"
                icon={hasStorage ? Upload : Plus}
                onClick={hasStorage ? onOpenUpload : onOpenAddStorage}
              >
                {hasStorage ? 'Upload Photo or Video' : 'Connect Storage'}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {data.recentMedia.map((m, idx) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setLightboxIndex(idx);
                    setLightboxOpen(true);
                  }}
                  className="aspect-square rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-teal-500/50 overflow-hidden relative group transition-all"
                >
                  <div className="w-full h-full flex items-center justify-center text-slate-400 group-hover:scale-105 transition-transform">
                    {m.media_type === 'video' ? (
                      <Film className="w-6 h-6 text-amber-400" />
                    ) : m.media_type === 'pdf' || m.media_type === 'document' ? (
                      <FileText className="w-6 h-6 text-teal-400" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-teal-400" />
                    )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                    <p className="text-[10px] text-white font-medium truncate">{m.original_filename}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
              <Lock className="w-3.5 h-3.5 text-teal-400" />
              <span>Direct streaming from user cloud storage</span>
            </span>
            <Link href="/vault" className="text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1 text-xs font-medium">
              <span>Open Password Vault</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Lightbox for Recent Media */}
      {data?.recentMedia && (
        <MediaLightbox
          mediaList={data.recentMedia}
          currentIndex={lightboxIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
