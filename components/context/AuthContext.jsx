'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { deriveClientKey } from '@/lib/crypto/client-vault';

const DEFAULT_INACTIVITY_MINUTES = 15;
const INACTIVITY_STORAGE_KEY = 'panda_inactivity_minutes';
const LAST_ACTIVITY_STORAGE_KEY = 'panda_last_activity_timestamp';

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  isSupabaseActive: false,
  clientCryptoKey: null,
  inactivityMinutes: DEFAULT_INACTIVITY_MINUTES,
  updateInactivityTimeout: () => {},
  signInWithOtp: async () => {},
  verifyOtp: async () => {},
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  resetPasswordForEmail: async () => {},
  updateUserPasswordWithOtp: async () => {},
  refreshAuth: async () => {},
});

function purgeLocalAuthStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('panda_auth'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    } catch {}
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientCryptoKey, setClientCryptoKey] = useState(null);
  const [inactivityMinutes, setInactivityMinutesState] = useState(DEFAULT_INACTIVITY_MINUTES);
  const lastActivityRef = useRef(Date.now());
  const router = useRouter();

  // Load saved inactivity timeout preference
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(INACTIVITY_STORAGE_KEY);
        if (saved !== null) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            setInactivityMinutesState(parsed);
          }
        }
      } catch {}
    }
  }, []);

  const updateInactivityTimeout = (minutes) => {
    const mins = Math.max(1, parseInt(minutes, 10) || 15);
    setInactivityMinutesState(mins);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(INACTIVITY_STORAGE_KEY, mins.toString());
      } catch {}
    }
    lastActivityRef.current = Date.now();

    // Persist to database via backend API
    fetch('/api/settings/inactivity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ minutes: mins }),
    }).catch(() => {});
  };

  /**
   * Fast Reactive Auth Check: Frontend -> Backend API (/api/auth/me) -> Database
   */
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          setSession(data.session || { id: data.user.id });
          if (data.user?.inactivity_timeout_minutes) {
            setInactivityMinutesState(data.user.inactivity_timeout_minutes);
          }
        } else {
          setUser(null);
          setSession(null);
        }
      } else {
        setUser(null);
        setSession(null);
      }
    } catch {
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Hydrate auth status reactively on mount with useEffect
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /**
   * Live Session Presence & Revocation Watchdog
   * Checks every 25s (and on window focus) if session is valid in DB
   */
  useEffect(() => {
    if (!user) return;

    let lastCheckTime = 0;
    const checkRevocationStatus = async () => {
      const now = Date.now();
      if (now - lastCheckTime < 20000) return; // Throttle to max once per 20s
      lastCheckTime = now;

      try {
        const res = await fetch('/api/auth/heartbeat', {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-cache' },
        });

        if (res.status === 401) {
          // Session was revoked or expired in DB! Kick to login
          purgeLocalAuthStorage();
          setUser(null);
          setSession(null);
          setClientCryptoKey(null);
          window.location.href = '/login?reason=revoked';
        }
      } catch {}
    };

    const interval = setInterval(checkRevocationStatus, 30000);
    window.addEventListener('focus', checkRevocationStatus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkRevocationStatus);
    };
  }, [user]);

  /**
   * Automatic Inactivity Detector & Persistent Logout Timer
   */
  useEffect(() => {
    if (!user || inactivityMinutes <= 0) return;

    const timeoutMs = inactivityMinutes * 60 * 1000;

    let persisted = null;
    try {
      persisted = window.localStorage?.getItem(LAST_ACTIVITY_STORAGE_KEY);
    } catch {}

    const now = Date.now();
    if (persisted) {
      const lastTs = parseInt(persisted, 10);
      if (!isNaN(lastTs) && now - lastTs >= timeoutMs) {
        logout(true);
        return;
      }
      lastActivityRef.current = lastTs;
    } else {
      lastActivityRef.current = now;
      try {
        window.localStorage?.setItem(LAST_ACTIVITY_STORAGE_KEY, now.toString());
      } catch {}
    }

    let lastWriteTime = 0;
    const recordActivity = () => {
      const currentNow = Date.now();
      lastActivityRef.current = currentNow;
      if (currentNow - lastWriteTime > 10000) {
        lastWriteTime = currentNow;
        try {
          window.localStorage?.setItem(LAST_ACTIVITY_STORAGE_KEY, currentNow.toString());
        } catch {}
      }
    };

    const checkInactivity = () => {
      let checkTs = lastActivityRef.current;
      try {
        const stored = window.localStorage?.getItem(LAST_ACTIVITY_STORAGE_KEY);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed)) checkTs = parsed;
        }
      } catch {}

      const idleTime = Date.now() - checkTs;
      if (idleTime >= timeoutMs) {
        logout(true);
      }
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'pointerdown'];
    events.forEach((ev) => window.addEventListener(ev, recordActivity, { passive: true }));

    const handleWakeOrFocus = () => {
      checkInactivity();
    };
    window.addEventListener('focus', handleWakeOrFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    });

    const checkInterval = setInterval(checkInactivity, 5000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, recordActivity));
      window.removeEventListener('focus', handleWakeOrFocus);
      clearInterval(checkInterval);
    };
  }, [user, inactivityMinutes]);

  const initializeClientKey = async (secret, userEmail) => {
    try {
      if (typeof window !== 'undefined' && window.crypto && secret) {
        const derivedKey = await deriveClientKey(secret, `panda_vault_${userEmail || 'salt'}`);
        setClientCryptoKey(derivedKey);
      }
    } catch {}
  };

  /**
   * Send 6-digit Email OTP: Frontend -> Backend API (/api/auth/otp) -> DB
   */
  const signInWithOtp = async (email, name = null, isSignUp = false) => {
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'send', email, name, isSignUp }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to send security code. Please check your email and try again.');
    }
    return data;
  };

  /**
   * Verify 6-digit Email OTP: Frontend -> Backend API (/api/auth/otp) -> DB
   */
  const verifyOtp = async (email, token, name = null, password = null) => {
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'verify', email, token, name, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid or expired verification code. Please check and try again.');
    }

    if (data.user) {
      setUser(data.user);
      setSession({ id: data.user.id });
      const secretToDerive = password || token;
      await initializeClientKey(secretToDerive, email);
      router.push('/dashboard');
    }

    return data;
  };

  /**
   * Login: Frontend -> Backend API (/api/auth/login) -> Database
   */
  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid email or password.');
    }

    setUser(data.user);
    setSession({ id: data.user.id });
    await initializeClientKey(password, email);
    router.push('/dashboard');
    return data;
  };

  /**
   * Register: Frontend -> Backend API (/api/auth/register) -> Database
   */
  const register = async (email, password, confirmPassword, name = null) => {
    if (confirmPassword && password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, confirmPassword, name }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create account.');
    }

    setUser(data.user);
    setSession({ id: data.user.id });
    await initializeClientKey(password, email);
    router.push('/dashboard');
    return data;
  };

  /**
   * Request Password Reset: Frontend -> Backend API (/api/auth/forgot-password) -> DB
   */
  const resetPasswordForEmail = async (email) => {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to send reset instructions.');
    }
    return data;
  };

  /**
   * Verify Reset Code & Set Password: Frontend -> Backend API (/api/auth/reset-password) -> DB
   */
  const updateUserPasswordWithOtp = async (email, token, newPassword, confirmPassword) => {
    if (confirmPassword && newPassword !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, token, password: newPassword, confirmPassword }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to reset password.');
    }

    return data;
  };

  /**
   * Logout: Frontend -> Backend API (/api/auth/logout) -> Database
   */
  const logout = async (dueToInactivity = false) => {
    purgeLocalAuthStorage();

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}

    setUser(null);
    setSession(null);
    setClientCryptoKey(null);

    if (dueToInactivity) {
      router.push('/login?reason=inactivity');
    } else {
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isSupabaseActive: false,
        clientCryptoKey,
        inactivityMinutes,
        updateInactivityTimeout,
        signInWithOtp,
        verifyOtp,
        login,
        register,
        logout,
        resetPasswordForEmail,
        updateUserPasswordWithOtp,
        refreshAuth: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
