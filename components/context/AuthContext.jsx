'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/auth/supabase';
import { deriveClientKey } from '@/lib/crypto/client-vault';

const DEFAULT_INACTIVITY_MINUTES = 15;
const INACTIVITY_STORAGE_KEY = 'panda_inactivity_minutes';

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

  const isSupabaseActive = typeof window !== 'undefined' && isSupabaseConfigured();

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
    const mins = Math.max(0, parseInt(minutes, 10) || 0);
    setInactivityMinutesState(mins);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(INACTIVITY_STORAGE_KEY, mins.toString());
      } catch {}
    }
    lastActivityRef.current = Date.now();
  };

  /**
   * Ultra-Fast Optimistic Auth Check
   * Resolves in <50ms, then validates against live Supabase backend in background.
   */
  const checkAuth = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();

      if (supabase) {
        // 1. Fast cache read to render UI instantly (<10ms)
        const { data: { session: fastSession } } = await supabase.auth.getSession();
        if (fastSession?.user) {
          const userName =
            fastSession.user.user_metadata?.full_name ||
            fastSession.user.user_metadata?.name ||
            null;

          setSession(fastSession);
          setUser({
            id: fastSession.user.id,
            email: fastSession.user.email,
            name: userName,
            createdAt: fastSession.user.created_at,
          });
          setLoading(false);

          // 2. Background verification with live database server
          supabase.auth.getUser().then(({ data, error }) => {
            if (error || !data?.user) {
              purgeLocalAuthStorage();
              setUser(null);
              setSession(null);
              setClientCryptoKey(null);
            }
          }).catch(() => {});
          return;
        }
      }

      // 3. Fallback server cookie check
      const res = await fetch('/api/auth/me', {
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          setSession({ user: data.user });
        } else {
          setUser(null);
          setSession(null);
        }
      } else {
        setUser(null);
        setSession(null);
      }
    } catch (err) {
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let subscription = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((event, currentSession) => {
        if (event === 'SIGNED_OUT' || !currentSession?.user) {
          purgeLocalAuthStorage();
          setUser(null);
          setSession(null);
          setClientCryptoKey(null);
          return;
        }

        if (currentSession?.user) {
          const userName =
            currentSession.user.user_metadata?.full_name ||
            currentSession.user.user_metadata?.name ||
            null;

          setSession(currentSession);
          setUser({
            id: currentSession.user.id,
            email: currentSession.user.email,
            name: userName,
            createdAt: currentSession.user.created_at,
          });
        }
      });
      subscription = data?.subscription;
    } catch {}

    return () => {
      subscription?.unsubscribe?.();
    };
  }, [checkAuth]);

  /**
   * Automatic Inactivity Detector & Logout Timer
   */
  useEffect(() => {
    if (!user || inactivityMinutes <= 0) return;

    lastActivityRef.current = Date.now();
    const timeoutMs = inactivityMinutes * 60 * 1000;

    const recordActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((ev) => window.addEventListener(ev, recordActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;
      if (idleTime >= timeoutMs) {
        logout(true); // Logout with inactivity flag
      }
    }, 5000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, recordActivity));
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
   * Send 6-digit Email OTP
   */
  const signInWithOtp = async (email, name = null, isSignUp = false) => {
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', email, name, isSignUp }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to send security code. Please check your email and try again.');
    }
    return data;
  };

  /**
   * Verify 6-digit Email OTP
   */
  const verifyOtp = async (email, token, name = null, password = null) => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      try {
        const { data, error } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: token.trim(),
          type: 'email',
        });

        if (!error && data?.user) {
          const userName =
            name ||
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            null;

          if (password) {
            try {
              await supabase.auth.updateUser({ password });
            } catch {}
          }

          setUser({
            id: data.user.id,
            email: data.user.email,
            name: userName,
            createdAt: data.user.created_at,
          });
          setSession(data.session);

          const secretToDerive = password || token;
          await initializeClientKey(secretToDerive, email);

          try {
            await fetch('/api/auth/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: data.user.id,
                email: data.user.email,
                name: userName,
                password: password || token,
              }),
            });
          } catch {}

          router.push('/dashboard');
          return data;
        }
      } catch {}
    }

    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', email, token, name }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid or expired verification code. Please check and try again.');
    }

    if (data.user) {
      setUser(data.user);
      const secretToDerive = password || token;
      await initializeClientKey(secretToDerive, email);
      router.push('/dashboard');
    }

    return data;
  };

  /**
   * Login with email and password
   */
  const login = async (email, password) => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          if (error.message && error.message.toLowerCase().includes('email not confirmed')) {
            throw new Error('Your email is not confirmed yet. Please check your inbox or disable "Confirm Email" in Supabase Auth settings.');
          }
        }

        if (!error && data?.user) {
          const userName =
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            null;

          setUser({
            id: data.user.id,
            email: data.user.email,
            name: userName,
            createdAt: data.user.created_at,
          });
          setSession(data.session);
          await initializeClientKey(password, email);

          try {
            await fetch('/api/auth/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: data.user.id,
                email: data.user.email,
                name: userName,
                password,
              }),
            });
          } catch {}

          router.push('/dashboard');
          return data;
        }
      } catch (e) {
        if (e.message && e.message.includes('email is not confirmed')) {
          throw e;
        }
      }
    }

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid email or password.');
    }

    setUser(data.user);
    await initializeClientKey(password, email);
    router.push('/dashboard');
    return data;
  };

  /**
   * Register with email, password, and name
   */
  const register = async (email, password, confirmPassword, name = null) => {
    if (confirmPassword && password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      try {
        const options = {};
        if (name) {
          options.data = {
            full_name: name.trim(),
            name: name.trim(),
          };
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options,
        });

        if (!error && data?.user) {
          const userName =
            name ||
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            null;

          if (data.session) {
            setUser({
              id: data.user.id,
              email: data.user.email,
              name: userName,
              createdAt: data.user.created_at,
            });
            setSession(data.session);
            await initializeClientKey(password, email);
          }

          try {
            await fetch('/api/auth/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: data.user.id,
                email: data.user.email,
                name: userName,
                password,
              }),
            });
          } catch {}

          if (data.session) {
            router.push('/dashboard');
          }
          return data;
        }
      } catch {}
    }

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, confirmPassword, name }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create account.');
    }

    setUser(data.user);
    await initializeClientKey(password, email);
    router.push('/dashboard');
    return data;
  };

  /**
   * Request Password Reset Email / OTP
   */
  const resetPasswordForEmail = async (email) => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      try {
        const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/forgot-password` : undefined;
        const { data, error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo,
        });

        if (!error) return data;
      } catch {}
    }

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to send reset instructions.');
    }
    return data;
  };

  /**
   * Verify OTP and Set New Password
   */
  const updateUserPasswordWithOtp = async (email, token, newPassword, confirmPassword) => {
    if (confirmPassword && newPassword !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      try {
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: token.trim(),
          type: 'recovery',
        });

        if (verifyError) {
          await supabase.auth.verifyOtp({
            email: email.trim().toLowerCase(),
            token: token.trim(),
            type: 'email',
          });
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          throw new Error(updateError.message || 'Failed to update password');
        }
      } catch (err) {
        console.warn('Supabase reset flow note:', err.message);
      }
    }

    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: newPassword, confirmPassword }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to reset password.');
    }

    return data;
  };

  /**
   * Logout (Optional: dueToInactivity)
   */
  const logout = async (dueToInactivity = false) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }

    purgeLocalAuthStorage();

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
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
        isSupabaseActive,
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
