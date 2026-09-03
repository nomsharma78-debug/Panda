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
      fetchAuditLogs();
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

  const fetchAuditLogs = async () => {
    try {
      setLoadingLogs(true);
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/audit?limit=50', { headers, credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setAuditLogs(d.logs || []);
      }
    } catch {}
    finally {
      setLoadingLogs(false);
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
                    value={inactivityMinutes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) {
                        updateInactivityTimeout(val);
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4 max-w-4xl">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">Security Audit Log</h3>
            <p className="text-xs text-slate-400">
              Immutable server-side audit logs for all security actions. Secrets and passwords are never logged.
            </p>
          </div>

          {loadingLogs ? (
            <p className="text-xs text-slate-400">Loading audit history...</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">No audit events recorded.</p>
          ) : (
            <div className="divide-y divide-slate-800/80 overflow-x-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-center justify-between text-xs gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        log.status === 'SUCCESS'
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="font-mono text-slate-200 font-medium">{log.action}</span>
                  </div>

                  <div className="flex items-center gap-4 text-slate-400 text-[11px] font-mono shrink-0">
                    <span>{log.ip_address}</span>
                    <span>{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
