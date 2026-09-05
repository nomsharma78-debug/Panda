'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Shield,
  Sparkles,
  Zap,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { DisconnectStorageModal } from './DisconnectStorageModal';
import { useToast } from '@/components/context/ToastContext';
import { useAuth } from '@/components/context/AuthContext';
import { pandaCache } from '@/lib/client-cache';
import { useCustomEvent } from '@/hooks/useCustomEvent';
import {
  PANDA_EVENTS,
  PROVIDER_TIER_QUOTAS,
  DEFAULT_STORAGE_LIMIT_BYTES,
  PROVIDER_STYLE_MAP,
} from '@/lib/constants/index';
import { formatBytes } from '@/lib/utils/formatters';

const CACHE_KEY = 'storage:connections';
const CACHE_TTL = 120_000; // 2 minutes

export function StorageManager({ onOpenAddModal }) {
  const { session } = useAuth();
  const { success, error: toastError } = useToast();

  // Initialise state from cache immediately — zero loading flash
  const cached = pandaCache.get(CACHE_KEY);
  const [connections, setConnections] = useState(cached?.connections || []);
  const [combinedMetrics, setCombinedMetrics] = useState(cached?.combined || null);
  const [loading, setLoading] = useState(!cached);
  const [testingId, setTestingId] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const [settingDefaultId, setSettingDefaultId] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);

  const fetchStorageData = useCallback(async (force = false) => {
    // If not forcing and cache exists, prime state immediately
    if (!force) {
      const cachedData = pandaCache.get(CACHE_KEY);
      if (cachedData) {
        setConnections(cachedData.connections || []);
        setCombinedMetrics(cachedData.combined || null);
        setLoading(false);
      }
    }

    const headers = { 'Cache-Control': 'no-cache' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    try {
      const res = await fetch('/api/storage', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const conns = data.connections || [];

        // Derive accurate metrics across all user connections
        let derivedUsed = 0;
        let derivedTotal = 0;
        let derivedFiles = 0;
        conns.forEach((c) => {
          const u = Number(c.used_bytes) || 0;
          const quota = PROVIDER_TIER_QUOTAS[c.provider?.toLowerCase()] || DEFAULT_STORAGE_LIMIT_BYTES;
          const t = Number(c.total_bytes) > 0 ? Number(c.total_bytes) : quota;
          derivedUsed += u;
          derivedTotal += t;
          derivedFiles += parseInt(c.file_count || '0', 10);
        });

        // Merge: prefer server combined if it has real used data, else use derived
        const serverCombined = data.combined || {};
        const mergedCombined = {
          usedBytes: Math.max(serverCombined.usedBytes || 0, derivedUsed),
          totalBytes: serverCombined.totalBytes || derivedTotal || DEFAULT_STORAGE_LIMIT_BYTES,
          fileCount: Math.max(serverCombined.fileCount || 0, derivedFiles),
          providerCount: conns.length,
          hasFixedQuota: true,
        };
        mergedCombined.availableBytes = Math.max(0, mergedCombined.totalBytes - mergedCombined.usedBytes);

        pandaCache.set(CACHE_KEY, { connections: conns, combined: mergedCombined }, CACHE_TTL);
        pandaCache.set('storage:metrics', mergedCombined, CACHE_TTL);
        setConnections(conns);
        setCombinedMetrics(mergedCombined);
      }
    } catch (err) {
      console.error('Fetch storage connections error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchStorageData(false);
  }, [session?.access_token, fetchStorageData]);

  // Reactive listener via custom hook: automatic cache invalidation and refetch
  const handleGlobalUpdate = useCallback(() => {
    pandaCache.invalidate(CACHE_KEY);
    pandaCache.invalidate('storage:metrics');
    fetchStorageData(true);
  }, [fetchStorageData]);

  useCustomEvent(PANDA_EVENTS.STORAGE_UPDATED, handleGlobalUpdate);
  useCustomEvent(PANDA_EVENTS.MEDIA_UPLOADED, handleGlobalUpdate);

  // Re-test existing storage connection live
  const handleTestStorage = async (conn) => {
    setTestingId(conn.id);
    try {
      const res = await fetch('/api/storage/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageId: conn.id }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        success(`✓ ${conn.name} verified: Connection is live and active.`);
      } else {
        toastError(`✕ Connection check failed: ${data.error || 'Check credentials'}`);
      }
    } catch {
      toastError('Failed to execute connection test.');
    } finally {
      setTestingId(null);
    }
  };

  // Live storage usage sync directly from cloud bucket
  const handleRefreshUsage = async (conn) => {
    setRefreshingId(conn.id);
    try {
      const res = await fetch(`/api/storage/${conn.id}/usage`, { method: 'POST' });

      if (res.ok) {
        success(`✓ Synced live storage usage for ${conn.name}.`);
        pandaCache.invalidate(CACHE_KEY);
        pandaCache.invalidate('storage:metrics');
        await fetchStorageData(true);
      } else {
        toastError('Failed to refresh bucket usage.');
      }
    } catch {
      toastError('Network error refreshing usage.');
    } finally {
      setRefreshingId(null);
    }
  };

  // Sync all storage connections and recalculate real usage
  const handleSyncAll = async () => {
    setLoading(true);
    try {
      pandaCache.invalidate(CACHE_KEY);
      pandaCache.invalidate('storage:metrics');
      const headers = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/storage?sync=true', { headers, credentials: 'include' });
      if (res.ok) {
        await fetchStorageData(true);
        success('✓ Successfully synced all storage providers and updated usage.');
      } else {
        toastError('Failed to sync storage providers.');
      }
    } catch {
      toastError('Network error syncing storage.');
    } finally {
      setLoading(false);
    }
  };

  // Set as default storage
  const handleSetDefault = async (conn) => {
    if (conn.is_default) return;
    setSettingDefaultId(conn.id);
    try {
      const res = await fetch(`/api/storage/${conn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });

      if (res.ok) {
        success(`${conn.name} is now your default storage destination.`);
        pandaCache.invalidate(CACHE_KEY);
        fetchStorageData(true);
      } else {
        toastError('Failed to set default storage.');
      }
    } catch {
      toastError('Network error updating default storage.');
    } finally {
      setSettingDefaultId(null);
    }
  };

  const getProviderIconColor = (p) => {
    const key = (p || '').toLowerCase();
    return PROVIDER_STYLE_MAP[key]?.color || 'text-teal-400 bg-teal-500/10 border-teal-500/30';
  };

  const connDerivedUsed = connections.reduce((acc, c) => acc + (Number(c.used_bytes) || 0), 0);
  const connDerivedTotal = connections.reduce((acc, c) => {
    const quota = PROVIDER_TIER_QUOTAS[c.provider?.toLowerCase()] || DEFAULT_STORAGE_LIMIT_BYTES;
    return acc + (Number(c.total_bytes) > 0 ? Number(c.total_bytes) : quota);
  }, 0);
  const connDerivedFiles = connections.reduce((acc, c) => acc + parseInt(c.file_count || '0', 10), 0);

  const usedBytes = Math.max(combinedMetrics?.usedBytes || 0, connDerivedUsed);
  const totalBytes = combinedMetrics?.totalBytes || connDerivedTotal || DEFAULT_STORAGE_LIMIT_BYTES;
  const availableBytes = Math.max(0, totalBytes - usedBytes);
  const fileCount = Math.max(combinedMetrics?.fileCount || 0, connDerivedFiles);
  const usagePercentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  const formattedPct = usedBytes === 0
    ? '0.0%'
    : usagePercentage < 0.01
    ? '< 0.01%'
    : usagePercentage < 1
    ? `${usagePercentage.toFixed(2)}%`
    : `${usagePercentage.toFixed(1)}%`;

  return (
    <div className="space-y-8">
      {/* Top Combined Storage Progress Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-card flex flex-col gap-6 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-60 h-60 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-teal-400">
              <Sparkles className="w-4 h-4" />
              <span>Unified Storage Hub</span>
              <Badge variant="teal" size="sm" className="text-[10px] ml-1">
                Real-Time Quota
              </Badge>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {formatBytes(usedBytes)} used of {formatBytes(totalBytes)}
            </h2>

            <p className="text-xs text-slate-400 leading-relaxed">
              All your connected cloud buckets and encrypted media assets are unified in one central storage layer. Raw files remain securely stored in your personal cloud buckets with zero third-party lock-in.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0 relative z-10">
            <Button variant="primary" size="md" icon={Plus} onClick={onOpenAddModal} className="shadow-lg shadow-teal-500/10">
              Connect Cloud Storage
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={handleSyncAll}
              disabled={loading}
              className="text-xs"
            >
              Sync Storage Usage
            </Button>
          </div>
        </div>

        {/* Real Storage Usage Bar */}
        <div className="space-y-2 bg-slate-950/70 p-5 rounded-2xl border border-slate-800/80 relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-teal-400" />
              <span>Live Storage Meter</span>
            </span>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-teal-400 font-semibold">
                {usedBytes.toLocaleString()} Bytes ({formatBytes(usedBytes)})
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">
                {formatBytes(availableBytes)} Available Free
              </span>
            </div>
          </div>

          <Progress
            value={usedBytes}
            max={totalBytes}
            size="lg"
            variant={usagePercentage > 90 ? 'rose' : usagePercentage > 75 ? 'amber' : 'teal'}
            showLabel
          />

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 font-mono">
            <span>0 B (Start)</span>
            <span className="text-slate-300">{formatBytes(totalBytes)} Capacity ({formattedPct})</span>
          </div>
        </div>

        {/* 4-Stat Breakdown Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1 relative z-10">
          <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/60">
            <div className="text-[11px] text-slate-400 font-medium">Used Space</div>
            <div className="text-lg font-bold text-white mt-0.5 tracking-tight">{formatBytes(usedBytes)}</div>
            <div className="text-[10px] text-teal-400 font-mono mt-0.5">
              {formattedPct} of total
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/60">
            <div className="text-[11px] text-slate-400 font-medium">Free Space</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5 tracking-tight">{formatBytes(availableBytes)}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Available to upload</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/60">
            <div className="text-[11px] text-slate-400 font-medium">Total Media Files</div>
            <div className="text-lg font-bold text-white mt-0.5 tracking-tight">{fileCount}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Encrypted at rest</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/60">
            <div className="text-[11px] text-slate-400 font-medium">Active Providers</div>
            <div className="text-lg font-bold text-white mt-0.5 tracking-tight">{connections.length}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {connections.length === 0 ? 'Local Vault Tier' : `${connections.length} Cloud Bucket${connections.length !== 1 ? 's' : ''}`}
            </div>
          </div>
        </div>
      </div>

      {/* Connected Providers List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">Connected Storage Providers</h3>
            <p className="text-xs text-slate-400">Manage your external buckets, verify connectivity, and configure defaults.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-48 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
            <div className="h-48 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
          </div>
        ) : connections.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title="No cloud storage connected"
            description="Connect your Cloudflare R2, Backblaze B2, Amazon S3, or MinIO buckets to start uploading photos, videos, and large documents."
            actionLabel="Connect Cloud Storage"
            actionIcon={Plus}
            onAction={onOpenAddModal}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connections.map((conn) => {
              const used = Number(conn.used_bytes) || 0;
              const providerQuota = PROVIDER_TIER_QUOTAS[conn.provider?.toLowerCase()] || DEFAULT_STORAGE_LIMIT_BYTES;
              const providerTierTotal = Number(conn.total_bytes) > 0 ? Number(conn.total_bytes) : providerQuota;
              const fileCount = parseInt(conn.file_count || '0', 10);
              const isTesting = testingId === conn.id;
              const isRefreshing = refreshingId === conn.id;
              const isSettingDefault = settingDefaultId === conn.id;

              return (
                <div
                  key={conn.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 sm:p-6 shadow-card transition-all flex flex-col justify-between gap-4"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-2xl border ${getProviderIconColor(conn.provider)} shrink-0`}>
                          <HardDrive className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-white tracking-tight">{conn.name}</h4>
                            {conn.is_default && (
                              <Badge variant="teal" size="sm" className="text-[10px]">
                                Default
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 font-mono uppercase">
                            {conn.provider} • {conn.bucket || 'Bucket'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRefreshUsage(conn)}
                          disabled={isRefreshing}
                          className={`p-1.5 text-slate-400 hover:text-teal-300 rounded-xl hover:bg-slate-800 transition-colors ${
                            isRefreshing ? 'animate-spin text-teal-400' : ''
                          }`}
                          title="Sync live storage usage"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDisconnectTarget(conn)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-xl hover:bg-slate-800 transition-colors"
                          title="Disconnect storage"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Progress & Storage Metrics */}
                    {(() => {
                      const providerPct = providerTierTotal > 0 ? (used / providerTierTotal) * 100 : 0;
                      const formattedProviderPct = used > 0 && providerPct < 0.01 ? '< 0.01%' : `${providerPct.toFixed(1)}%`;
                      const providerVariant = providerPct > 90 ? 'rose' : providerPct > 75 ? 'amber' : 'teal';

                      return (
                        <div className="space-y-2 bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80">
                          <div className="flex justify-between items-center text-xs text-slate-300 font-medium">
                            <span className="font-semibold text-white">{formatBytes(used)} used</span>
                            <div className="flex items-center gap-2">
                              <span className="text-teal-400 font-mono text-[11px] font-semibold">{formattedProviderPct}</span>
                              <span className="text-slate-500">•</span>
                              <span className="text-slate-400 font-mono text-[11px]">{formatBytes(providerTierTotal)} Quota</span>
                            </div>
                          </div>

                          <Progress value={used} max={providerTierTotal} size="sm" variant={providerVariant} />

                          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                            <span>
                              {fileCount} media file{fileCount !== 1 ? 's' : ''} ({formatBytes(Math.max(0, providerTierTotal - used))} free)
                            </span>
                            <span className="text-emerald-400 flex items-center gap-1 font-mono">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Connected</span>
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Provider Quick Actions */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleTestStorage(conn)}
                        isLoading={isTesting}
                        icon={Zap}
                        className="text-xs w-full"
                      >
                        Test Connection
                      </Button>

                      {!conn.is_default ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetDefault(conn)}
                          isLoading={isSettingDefault}
                          icon={Star}
                          className="text-xs w-full hover:text-teal-300"
                        >
                          Set as Default
                        </Button>
                      ) : (
                        <div className="flex items-center justify-center text-[11px] text-teal-400 font-medium bg-teal-500/10 rounded-xl border border-teal-500/20 py-1.5">
                          Default Destination
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Security Footer */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono border-t border-slate-800/80 pt-3">
                    <span>Added {new Date(conn.created_at).toLocaleDateString()}</span>
                    <span className="text-teal-400 flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      <span>AES-256-GCM Encrypted</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Disconnection Modal */}
      <DisconnectStorageModal
        isOpen={Boolean(disconnectTarget)}
        onClose={() => setDisconnectTarget(null)}
        storageItem={disconnectTarget}
        allStorage={connections}
        onDisconnected={() => {
          fetchStorageData();
          window.dispatchEvent(new CustomEvent(PANDA_EVENTS.MEDIA_UPLOADED));
        }}
      />
    </div>
  );
}
