'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';

export function SettingsManager({ initialTab = 'account' }) {
  const { user, logout, inactivityMinutes, updateInactivityTimeout } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState(initialTab);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);

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

  useEffect(() => {
    if (activeTab === 'security') {
      fetchSessions();
    } else if (activeTab === 'database') {
      fetchSchemaSql();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  const fetchSessions = async () => {
    try {
      setLoadingSessions(true);
      const res = await fetch('/api/settings/sessions');
      if (res.ok) {
        const d = await res.json();
        setSessions(d.sessions || []);
      }
    } catch {}
    finally {
      setLoadingSessions(false);
    }
  };

  const fetchSchemaSql = async () => {
    try {
      const res = await fetch('/api/database/schema?json=true');
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
      const res = await fetch('/api/audit?limit=50');
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
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/settings/sessions?id=${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        success('Session revoked');
        fetchSessions();
      } else {
        toastError('Failed to revoke session');
      }
    } catch {
      toastError('Network error');
    }
  };

  const handleRevokeAllSessions = async () => {
    setIsRevokingSessions(true);
    try {
      const res = await fetch('/api/settings/sessions?all=true', { method: 'DELETE' });
      if (res.ok) {
        success('All other sessions revoked');
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
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                active
                  ? 'bg-teal-500 text-slate-950 font-semibold shadow-glow-teal'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
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
              <span className="text-slate-400 block mb-1">Full Name</span>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-white font-semibold">
                {user?.name || user?.email?.split('@')[0] || 'Not set'}
              </div>
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
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Active Sessions</h3>
                <p className="text-xs text-slate-400">
                  Devices and browsers currently logged into your Panda vault.
                </p>
              </div>

              {sessions.length > 1 && (
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={isRevokingSessions}
                  onClick={handleRevokeAllSessions}
                >
                  Revoke Others
                </Button>
              )}
            </div>

            {loadingSessions ? (
              <p className="text-xs text-slate-400">Loading active sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-slate-400">No active sessions found.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">
                          {s.userAgent?.includes('Mac')
                            ? 'macOS'
                            : s.userAgent?.includes('Windows')
                            ? 'Windows'
                            : s.userAgent?.includes('Linux')
                            ? 'Linux'
                            : 'Web Client'}
                        </span>
                        {s.isCurrent && <Badge variant="teal" size="sm">Current</Badge>}
                      </div>
                      <p className="text-slate-500 font-mono text-[11px] mt-0.5">
                        Expires: {new Date(s.expiresAt).toLocaleDateString()}
                      </p>
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
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
