'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Shield,
  Layers,
  Sparkles,
  Zap,
  Star,
  Cloud,
  Server,
  Database,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress, formatBytes } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { DisconnectStorageModal } from './DisconnectStorageModal';
import { useToast } from '@/components/context/ToastContext';
import { useAuth } from '@/components/context/AuthContext';
import { pandaCache } from '@/lib/client-cache';

const CACHE_KEY = 'storage:connections';
const CACHE_TTL = 120_000; // 2 minutes

export function StorageManager({ onOpenAddModal }) {
  const { session } = useAuth();
  const { success, error: toastError, info } = useToast();

  // Initialise state from cache immediately — zero loading flash
  const cached = pandaCache.get(CACHE_KEY);
  const [connections, setConnections] = useState(cached?.connections || []);
  const [combinedMetrics, setCombinedMetrics] = useState(cached?.combined || null);
  const [loading, setLoading] = useState(!cached); // skip spinner if cached
  const [testingId, setTestingId] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const [settingDefaultId, setSettingDefaultId] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);

  const fetchStorageData = useCallback(async (force = false) => {
    if (!force) {
      const cachedData = pandaCache.get(CACHE_KEY);
      if (cachedData) {
        setConnections(cachedData.connections || []);
        setCombinedMetrics(cachedData.combined || null);
        setLoading(false);
        return;
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
        pandaCache.set(CACHE_KEY, data, CACHE_TTL);
        if (data.combined) {
          pandaCache.set('storage:metrics', data.combined, CACHE_TTL);
        }
        setConnections(data.connections || []);
        setCombinedMetrics(data.combined || null);
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

  // Listen to global updates — invalidate cache and refetch
  useEffect(() => {
    const handleUpdated = () => {
      pandaCache.invalidate(CACHE_KEY);
      pandaCache.invalidate('storage:metrics');
      fetchStorageData(true);
    };
    window.addEventListener('panda:storage:updated', handleUpdated);
    window.addEventListener('panda:media:uploaded', handleUpdated);
    return () => {
      window.removeEventListener('panda:storage:updated', handleUpdated);
      window.removeEventListener('panda:media:uploaded', handleUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Re-test existing storage connection live
  const handleTestStorage = async (conn) => {
    setTestingId(conn.id);
    try {
      const res = await fetch('/api/storage/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageId: conn.id,
        }),
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
      const res = await fetch(`/api/storage/${conn.id}/usage`, {
        method: 'POST',
      });

      if (res.ok) {
        success(`✓ Synced live storage usage for ${conn.name}.`);
        await fetchStorageData();
      } else {
        toastError('Failed to refresh bucket usage.');
      }
    } catch {
      toastError('Network error refreshing usage.');
    } finally {
      setRefreshingId(null);
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
        fetchStorageData();
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
    switch (p.toLowerCase()) {
      case 'r2':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'b2':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 's3':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      case 'minio':
        return 'text-rose-500 bg-rose-500/10 border-rose-500/30';
      case 'wasabi':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      default:
        return 'text-teal-400 bg-teal-500/10 border-teal-500/30';
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Combined Storage Progress Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-teal-400">
            <Sparkles className="w-4 h-4" />
            <span>Connected Object Storage</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {connections.length > 0 && combinedMetrics?.totalBytes
              ? `${formatBytes(combinedMetrics.usedBytes)} used of ${formatBytes(combinedMetrics.totalBytes)}`
              : connections.length > 0
              ? `${formatBytes(combinedMetrics?.usedBytes || 0)} used across cloud storage`
              : '0 B used (No Cloud Storage Connected)'}
          </h2>

          <p className="text-xs text-slate-400 leading-relaxed">
            All your connected cloud buckets are unified into one seamless personal media library. Panda stores metadata in PostgreSQL while raw encrypted files remain in your cloud storage.
          </p>

          {connections.length > 0 && combinedMetrics?.totalBytes && (
            <div className="pt-2">
              <Progress
                value={combinedMetrics.usedBytes}
                max={combinedMetrics.totalBytes}
                size="md"
                variant="teal"
                showLabel
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 shrink-0">
          <Button variant="primary" size="md" icon={Plus} onClick={onOpenAddModal}>
            Connect Cloud Storage
          </Button>
          <div className="text-[11px] text-slate-400 text-center font-mono">
            {connections.length} connected provider{connections.length !== 1 ? 's' : ''}
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
              const total = conn.total_bytes ? Number(conn.total_bytes) : null;
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
                    <div className="space-y-2 bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80">
                      <div className="flex justify-between text-xs text-slate-300 font-medium">
                        <span>{formatBytes(used)} stored</span>
                        <span className="text-slate-400">
                          {total ? `${formatBytes(total)} tier` : 'Elastic / Unmetered'}
                        </span>
                      </div>

                      {total && <Progress value={used} max={total} size="sm" variant="teal" />}

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>{fileCount} media file{fileCount !== 1 ? 's' : ''}</span>
                        <span className="text-emerald-400 flex items-center gap-1 font-mono">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Connected</span>
                        </span>
                      </div>
                    </div>

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
          window.dispatchEvent(new CustomEvent('panda:media:uploaded'));
        }}
      />
    </div>
  );
}
