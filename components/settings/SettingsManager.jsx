'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  User,
  Shield,
  Key,
  Database,
  History,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Trash2,
  Loader2,
  Check,
  Server,
  Lock,
  Smartphone,
  Laptop,
  Monitor,
  Globe,
  Radio,
  LogOut,
  Search,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Upload,
  Cloud,
  CloudOff,
  FileText,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';
import { formatRelativeActivity } from '@/lib/utils/device';

export function SettingsManager({ initialTab = 'account' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');

  const { user, session, logout, inactivityMinutes, updateInactivityTimeout } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState(tabFromUrl || initialTab || 'account');

  // Keep state in sync if URL changes
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    router.replace(`/settings?tab=${tabId}`, { scroll: false });
  };

  // Profile state
  const [fullName, setFullName] = useState(user?.name || '');
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setFullName(user.name);
    }
  }, [user?.name]);

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    if (!fullName.trim()) {
      toastError('Please enter your full name');
      return;
    }
    setIsSavingName(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/settings/profile', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ name: fullName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        success('Profile name saved successfully!');
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        toastError(data.error || 'Failed to update name');
      }
    } catch {
      toastError('Network error saving name');
    } finally {
      setIsSavingName(false);
    }
  };

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  // Inactivity timeout state
  const [customInactivityInput, setCustomInactivityInput] = useState((inactivityMinutes || 15).toString());
  useEffect(() => {
    if (inactivityMinutes) {
      setCustomInactivityInput(inactivityMinutes.toString());
    }
  }, [inactivityMinutes]);

  // Live 1-second dynamic relative time tick
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Dual Database setup SQL state
  const [selectedDbType, setSelectedDbType] = useState('vault'); // 'vault' | 'auth'
  const [vaultSchemaSql, setVaultSchemaSql] = useState('');
  const [authSchemaSql, setAuthSchemaSql] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [dbConnectionString, setDbConnectionString] = useState('');
  const [testingDb, setTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState(null);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState('ALL');
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());
  const [isExporting, setIsExporting] = useState(false);

  // Fetch data on tab change or poll sessions in background
  useEffect(() => {
    if (activeTab === 'security') {
      fetchSessions(sessions.length === 0);
      const pollInterval = setInterval(() => {
        fetchSessions(false); // silent live background sync
      }, 3000);
      return () => clearInterval(pollInterval);
    } else if (activeTab === 'database') {
      fetchSchemaSql();
    } else if (activeTab === 'audit') {
      fetchAuditLogs(auditLogs.length === 0);
    }
  }, [activeTab, session?.access_token]);

  const fetchSessions = async (showLoading = false) => {
    try {
      if (showLoading) setLoadingSessions(true);
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/settings/sessions', { headers, credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setSessions(d.sessions || []);
      }
    } catch {}
    finally {
      if (showLoading) setLoadingSessions(false);
    }
  };

  const fetchSchemaSql = async () => {
    try {
      const res = await fetch('/api/database/schema?json=true', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setVaultSchemaSql(data.vaultSql || '');
        setAuthSchemaSql(data.authSql || '');
      }
    } catch {}
  };

  const fetchAuditLogs = async (showLoading = true) => {
    try {
      if (showLoading) setLoadingLogs(true);
      const headers = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/audit?limit=100', { headers, credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setAuditLogs(d.logs || []);
      }
    } catch {
      toastError('Failed to fetch audit logs');
    } finally {
      if (showLoading) setLoadingLogs(false);
    }
  };

  const toggleLogExpand = (id) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportAuditLogs = (format = 'json') => {
    if (!auditLogs || auditLogs.length === 0) {
      toastError('No logs to export');
      return;
    }
    setIsExporting(true);
    try {
      let content = '';
      let mime = 'application/json';
      let ext = 'json';

      if (format === 'json') {
        content = JSON.stringify(auditLogs, null, 2);
        mime = 'application/json';
        ext = 'json';
      } else {
        // CSV format
        const headers = ['ID', 'Action', 'Status', 'IP Address', 'User Agent', 'Timestamp', 'Metadata'];
        const rows = auditLogs.map((l) => [
          l.id,
          `"${(l.action || '').replace(/"/g, '""')}"`,
          l.status,
          l.ip_address || '',
          `"${(l.user_agent || '').replace(/"/g, '""')}"`,
          l.created_at,
          `"${JSON.stringify(l.metadata || {}).replace(/"/g, '""')}"`,
        ]);
        content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        mime = 'text/csv';
        ext = 'csv';
      }

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `panda_audit_log_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success(`Audit logs exported as .${ext.toUpperCase()}`);
    } catch {
      toastError('Failed to export audit logs');
    } finally {
      setIsExporting(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toastError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toastError('Password must be at least 8 characters');
      return;
    }

    setIsChangingPass(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        success('Password updated successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        toastError(data.error || 'Failed to update password');
      }
    } catch {
      toastError('Network error updating password');
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      setRevokingId(sessionId);
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/settings/sessions?id=${sessionId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        success('Device session revoked successfully');
        fetchSessions();
      } else {
        toastError('Failed to revoke session');
      }
    } catch {
      toastError('Network error');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllSessions = async () => {
    setIsRevokingSessions(true);
    try {
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/settings/sessions?all=true', {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        success('All other device sessions revoked');
        fetchSessions();
      } else {
        toastError('Failed to revoke all sessions');
      }
    } catch {
      toastError('Network error');
    } finally {
      setIsRevokingSessions(false);
    }
  };

  const currentDisplaySql = selectedDbType === 'vault' ? vaultSchemaSql : authSchemaSql;

  const handleCopySql = () => {
    if (currentDisplaySql) {
      navigator.clipboard.writeText(currentDisplaySql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
      success(`${selectedDbType === 'vault' ? 'Vault DB' : 'Auth DB'} SQL copied to clipboard`);
    }
  };

  const handleTestDatabase = async () => {
    if (!dbConnectionString) {
      toastError('Please enter a connection string');
      return;
    }
    setTestingDb(true);
    setDbTestResult(null);

    try {
      const res = await fetch('/api/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: dbConnectionString }),
      });

      const data = await res.json();
      setDbTestResult(data);
      if (data.success) {
        success('Database verified successfully!');
      } else {
        toastError(data.error || 'Database connection test failed');
      }
    } catch {
      toastError('Network error testing database');
    } finally {
      setTestingDb(false);
    }
  };

  const tabs = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'security', label: 'Security & Sessions', icon: Shield },
    { id: 'audit', label: 'Audit Log', icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Selector */}
      <div className="flex items-center gap-1.5 border-b border-slate-800/80 pb-3 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                active
                  ? 'bg-slate-900 text-teal-300 font-semibold border border-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_6px_rgba(0,0,0,0.3)]'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-teal-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ACCOUNT TAB */}
      {activeTab === 'account' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-6 max-w-2xl">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">Account Information</h3>
            <p className="text-xs text-slate-400">Manage your Panda profile and vault session.</p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-1 font-medium">Full Name</span>
              <form onSubmit={handleSaveProfile} className="flex gap-2">
                <Input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="flex-1"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSavingName || !fullName.trim() || fullName.trim() === user?.name}
                  isLoading={isSavingName}
                >
                  Save Name
                </Button>
              </form>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Email Address</span>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-200 font-medium">
                {user?.email}
              </div>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Account ID</span>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-400 font-mono text-[11px]">
                {user?.id}
              </div>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Encryption Mode</span>
              <Badge variant="teal" size="md">
                AES-256-GCM Authenticated Encryption
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* SECURITY & SESSIONS TAB */}
      {activeTab === 'security' && (
        <div className="space-y-6 max-w-2xl">
          {/* Change Password */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">Change Password</h3>
              <p className="text-xs text-slate-400">
                Passwords are re-hashed with Argon2id. Your vault items remain securely encrypted.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3 pt-2">
              <Input
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <Input
                label="New Password"
                type="password"
                placeholder="Minimum 8 characters with numbers & symbols"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
              />

              <div className="pt-2">
                <Button type="submit" variant="primary" size="sm" isLoading={isChangingPass} icon={Key}>
                  Update Password
                </Button>
              </div>
            </form>
          </div>

          {/* Active Sessions */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Active Sessions & Devices</h3>
                <p className="text-xs text-slate-400">
                  Manage devices and browsers currently logged into your Panda vault.
                </p>
              </div>

              {sessions.length > 1 && (
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={isRevokingSessions}
                  onClick={handleRevokeAllSessions}
                  icon={LogOut}
                >
                  Revoke All Others
                </Button>
              )}
            </div>

            {loadingSessions ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                <span>Loading active sessions...</span>
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">No active sessions found.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => {
                  const isMobile = s.deviceType === 'mobile' || s.deviceType === 'tablet';
                  const DeviceIcon = isMobile ? Smartphone : Laptop;
                  const activity = formatRelativeActivity(s.lastActiveAt || s.createdAt);
                  const isLiveNow = s.isCurrent || (activity.isActiveNow && s.lastActiveAt);
                  const liveLabel = s.isCurrent ? 'Active now' : (isLiveNow ? 'Active now' : activity.label);

                  return (
                    <div
                      key={s.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        s.isCurrent
                          ? 'bg-slate-950/90 border-teal-500/40 shadow-sm'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`p-2.5 rounded-xl border flex-shrink-0 ${
                            s.isCurrent
                              ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}
                        >
                          <DeviceIcon className="w-5 h-5" />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-semibold text-white text-sm">
                              {s.deviceName || 'Web Browser'}
                            </span>

                            {s.isCurrent && (
                              <Badge variant="teal" size="sm">
                                This Device
                              </Badge>
                            )}

                            {isLiveNow ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                                Active now
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                {liveLabel}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400 font-mono text-[11px]">
                            {s.ipAddress && s.ipAddress !== 'Unknown IP' && s.ipAddress !== '—' && (
                              <span>IP: {s.ipAddress}</span>
                            )}
                            <span>•</span>
                            <span>Signed in: {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Today'}</span>
                            <span>•</span>
                            <span>Expires: {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : 'Active'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        {s.isCurrent ? (
                          <span className="text-xs text-teal-400 font-medium px-2 py-1 bg-teal-500/5 rounded-lg border border-teal-500/10">
                            Current Session
                          </span>
                        ) : (
                          <Button
                            variant="danger"
                            size="sm"
                            className="text-xs px-3 py-1.5 rounded-xl"
                            isLoading={revokingId === s.id}
                            onClick={() => handleRevokeSession(s.id)}
                            icon={Trash2}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* INACTIVITY AUTO-LOGOUT SETTINGS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-teal-400" />
                <h3 className="text-base font-semibold text-white">Inactivity Auto-Logout</h3>
              </div>
              <p className="text-xs text-slate-400">
                Automatically sign out and lock your vault after a period of user inactivity to protect your data.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <span className="text-xs font-medium text-slate-300 block">Select Inactivity Duration:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[5, 10, 15, 30, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      updateInactivityTimeout(mins);
                      success(`Inactivity timeout set to ${mins} minutes`);
                    }}
                    className={`p-3 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                      inactivityMinutes === mins
                        ? 'bg-teal-500 text-slate-950 border-teal-400 shadow-glow-teal font-bold'
                        : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{mins} Mins</span>
                    <span className="text-[10px] opacity-80">{mins === 15 ? 'Default' : ''}</span>
                  </button>
                ))}
              </div>

              <div className="pt-2 flex items-center gap-3">
                <span className="text-xs text-slate-400">Or custom minutes:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={customInactivityInput}
                    onChange={(e) => {
                      setCustomInactivityInput(e.target.value);
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= 480) {
                        updateInactivityTimeout(val);
                      }
                    }}
                    onBlur={() => {
                      const val = parseInt(customInactivityInput, 10);
                      if (!isNaN(val) && val >= 1 && val <= 480) {
                        updateInactivityTimeout(val);
                        success(`Inactivity timeout set to ${val} minutes`);
                      } else {
                        setCustomInactivityInput((inactivityMinutes || 15).toString());
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.target.blur();
                      }
                    }}
                    className="w-20 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-center focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-xs text-slate-400">minutes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOGS TAB */}
      {activeTab === 'audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-card space-y-6 max-w-5xl animate-fade-in">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-teal-400" />
                <h3 className="text-base sm:text-lg font-bold text-white">Security & Audit History</h3>
              </div>
              <p className="text-xs text-slate-400 max-w-xl">
                Immutable chronological log of authentication, vault actions, and cloud storage events. Secrets and credentials are automatically redacted.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                isLoading={loadingLogs}
                onClick={() => fetchAuditLogs(true)}
                title="Refresh audit logs"
              >
                Refresh
              </Button>

              <div className="relative group">
                <Button
                  variant="outline"
                  size="sm"
                  icon={Download}
                  isLoading={isExporting}
                  onClick={() => handleExportAuditLogs('json')}
                >
                  Export JSON
                </Button>
              </div>

              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                isLoading={isExporting}
                onClick={() => handleExportAuditLogs('csv')}
              >
                Export CSV
              </Button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {[
                { id: 'ALL', label: 'All Events' },
                { id: 'AUTH', label: 'Authentication' },
                { id: 'VAULT', label: 'Vault' },
                { id: 'STORAGE', label: 'Storage' },
                { id: 'MEDIA', label: 'Media' },
                { id: 'FAILED', label: 'Failed' },
              ].map((f) => {
                const active = auditFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setAuditFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      active
                        ? 'bg-teal-500 text-slate-950 shadow-glow-teal'
                        : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800/80'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search action, IP, metadata..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Content Area */}
          {loadingLogs ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
              <span className="text-xs font-mono">Retrieving security audit trail…</span>
            </div>
          ) : (() => {
            const filteredLogs = auditLogs.filter((log) => {
              const act = (log.action || '').toUpperCase();
              const status = (log.status || '').toUpperCase();
              const metaStr = JSON.stringify(log.metadata || {}).toLowerCase();
              const ip = (log.ip_address || '').toLowerCase();
              const ua = (log.user_agent || '').toLowerCase();

              // Category filter
              if (auditFilter === 'AUTH' && !act.includes('AUTH') && !act.includes('LOGIN') && !act.includes('LOGOUT') && !act.includes('REGISTER') && !act.includes('PASSWORD') && !act.includes('SESSION')) {
                return false;
              }
              if (auditFilter === 'VAULT' && !act.includes('VAULT')) {
                return false;
              }
              if (auditFilter === 'STORAGE' && !act.includes('STORAGE')) {
                return false;
              }
              if (auditFilter === 'MEDIA' && !act.includes('MEDIA')) {
                return false;
              }
              if (auditFilter === 'FAILED' && status === 'SUCCESS') {
                return false;
              }

              // Search query
              if (auditSearch && auditSearch.trim()) {
                const q = auditSearch.trim().toLowerCase();
                const matchAction = act.toLowerCase().includes(q);
                const matchIp = ip.includes(q);
                const matchUa = ua.includes(q);
                const matchMeta = metaStr.includes(q);
                if (!matchAction && !matchIp && !matchUa && !matchMeta) return false;
              }

              return true;
            });

            if (filteredLogs.length === 0) {
              return (
                <div className="p-12 text-center bg-slate-950/60 rounded-2xl border border-slate-800/80 space-y-3">
                  <ShieldCheck className="w-10 h-10 text-slate-500 mx-auto" />
                  <h4 className="text-sm font-semibold text-slate-200">No Audit Events Found</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {auditSearch || auditFilter !== 'ALL'
                      ? 'No events match the current filter or search criteria.'
                      : 'Audit events will appear here automatically when security actions occur in your vault.'}
                  </p>
                  {(auditSearch || auditFilter !== 'ALL') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAuditSearch('');
                        setAuditFilter('ALL');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              );
            }

            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-mono">
                  <span>Showing {filteredLogs.length} events</span>
                  <span>Zero-Knowledge Redaction Active</span>
                </div>

                <div className="space-y-2.5">
                  {filteredLogs.map((log) => {
                    const isExpanded = expandedLogIds.has(log.id);
                    const isSuccess = log.status === 'SUCCESS';
                    const rawAction = log.action || 'SECURITY_EVENT';
                    const act = rawAction.toUpperCase();

                    let ActionIcon = ShieldCheck;
                    let actionLabel = rawAction.replace(/_/g, ' ');
                    let actionColor = 'text-teal-400 bg-teal-500/10 border-teal-500/30';

                    if (act.includes('LOGIN')) {
                      ActionIcon = Key;
                      actionLabel = 'User Logged In';
                      actionColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                    } else if (act.includes('LOGOUT')) {
                      ActionIcon = LogOut;
                      actionLabel = 'User Signed Out';
                      actionColor = 'text-slate-400 bg-slate-500/10 border-slate-500/30';
                    } else if (act.includes('REGISTER')) {
                      ActionIcon = UserPlus;
                      actionLabel = 'Account Created';
                      actionColor = 'text-teal-400 bg-teal-500/10 border-teal-500/30';
                    } else if (act.includes('PASSWORD')) {
                      ActionIcon = Key;
                      actionLabel = 'Password Changed';
                      actionColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
                    } else if (act.includes('SESSION')) {
                      ActionIcon = Smartphone;
                      actionLabel = 'Session Revoked';
                      actionColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
                    } else if (act.includes('VAULT') && act.includes('CREATE')) {
                      ActionIcon = Lock;
                      actionLabel = 'Vault Item Created';
                      actionColor = 'text-teal-400 bg-teal-500/10 border-teal-500/30';
                    } else if (act.includes('VAULT') && act.includes('UPDATE')) {
                      ActionIcon = Lock;
                      actionLabel = 'Vault Item Updated';
                      actionColor = 'text-sky-400 bg-sky-500/10 border-sky-500/30';
                    } else if (act.includes('VAULT') && act.includes('DELETE')) {
                      ActionIcon = Trash2;
                      actionLabel = 'Vault Item Deleted';
                      actionColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
                    } else if (act.includes('STORAGE') && (act.includes('CONNECT') || act.includes('CREATE'))) {
                      ActionIcon = Cloud;
                      actionLabel = 'Cloud Storage Connected';
                      actionColor = 'text-teal-400 bg-teal-500/10 border-teal-500/30';
                    } else if (act.includes('STORAGE') && act.includes('DELETE')) {
                      ActionIcon = CloudOff;
                      actionLabel = 'Cloud Storage Disconnected';
                      actionColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
                    } else if (act.includes('MEDIA') && act.includes('UPLOAD')) {
                      ActionIcon = Upload;
                      actionLabel = 'Media Uploaded';
                      actionColor = 'text-teal-400 bg-teal-500/10 border-teal-500/30';
                    } else if (act.includes('MEDIA') && act.includes('DELETE')) {
                      ActionIcon = Trash2;
                      actionLabel = 'Media Deleted';
                      actionColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
                    } else if (act.includes('INACTIVITY')) {
                      ActionIcon = Clock;
                      actionLabel = 'Inactivity Timeout Changed';
                      actionColor = 'text-purple-400 bg-purple-500/10 border-purple-500/30';
                    }

                    const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

                    return (
                      <div
                        key={log.id}
                        className="bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4 transition-all duration-150 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`p-2.5 rounded-xl border flex-shrink-0 ${actionColor}`}>
                              <ActionIcon className="w-4 h-4" />
                            </div>

                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-semibold text-slate-100 text-xs sm:text-sm">
                                  {actionLabel}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                                    isSuccess
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  }`}
                                >
                                  {log.status || 'SUCCESS'}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                                  {rawAction}
                                </span>
                              </div>

                              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-slate-400 text-[11px] font-mono">
                                <span>IP: {log.ip_address || '127.0.0.1'}</span>
                                {log.user_agent && (
                                  <>
                                    <span>•</span>
                                    <span className="truncate max-w-[200px] sm:max-w-xs" title={log.user_agent}>
                                      {log.user_agent}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center shrink-0">
                            <span className="text-[11px] text-slate-400 font-mono">
                              {new Date(log.created_at).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>

                            {hasMetadata && (
                              <button
                                type="button"
                                onClick={() => toggleLogExpand(log.id)}
                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors flex items-center gap-1 text-[11px]"
                                title="View metadata"
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable Metadata JSON Viewer */}
                        {isExpanded && hasMetadata && (
                          <div className="pt-2 border-t border-slate-900 animate-slide-up">
                            <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                              Event Metadata:
                            </span>
                            <pre className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-teal-300 overflow-x-auto">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
