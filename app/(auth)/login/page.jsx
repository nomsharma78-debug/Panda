'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PandaLogo } from '@/components/ui/PandaLogo';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';
import { ShieldCheck, LogIn, AlertCircle, Mail, KeyRound, ArrowRight, Clock } from 'lucide-react';

function LoginContent() {
  const { login, signInWithOtp, verifyOtp } = useAuth();
  const { success } = useToast();
  const searchParams = useSearchParams();
  const isInactiveReason = searchParams.get('reason') === 'inactivity';

  const [authMethod, setAuthMethod] = useState('password'); // 'password' | 'otp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Step 1: Send OTP code via Supabase Auth
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email) {
      setErrorMsg('Please enter your email address');
      return;
    }

    setIsLoading(true);
    try {
      await signInWithOtp(email, null, false);
      setOtpSent(true);
      success('6-digit security code sent to your email!');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send security code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP code via Supabase Auth
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!otpCode || otpCode.length < 6) {
      setErrorMsg('Please enter the 6-digit security code sent to your email');
      return;
    }

    setIsLoading(true);
    try {
      await verifyOtp(email, otpCode);
      success('Welcome back to your Panda Vault');
    } catch (err) {
      setErrorMsg(err.message || 'Invalid or expired code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Password Login
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email || !password) {
      setErrorMsg('Please enter your email and password');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      success('Welcome back to your Panda Vault');
    } catch (err) {
      setErrorMsg(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 animate-fade-in relative overflow-hidden">
      {/* Subtle Ambient Light */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="flex justify-center mb-4">
          <PandaLogo size="lg" />
        </div>
        <p className="text-xs text-slate-400 font-medium tracking-tight">
          Sign in to access your encrypted personal digital vault
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 relative z-10">
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-card space-y-6 backdrop-blur-xl">
          {/* Inactivity Notice Banner */}
          {isInactiveReason && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs animate-slide-up">
              <Clock className="w-4 h-4 shrink-0" />
              <span>You were automatically signed out due to inactivity to protect your vault.</span>
            </div>
          )}

          {/* Revocation Notice Banner */}
          {(searchParams.get('reason') === 'revoked' || searchParams.get('revoked') === 'true') && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-slide-up">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Your session on this device was revoked from another device. Please sign in again.</span>
            </div>
          )}

          {/* Method Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/80 rounded-2xl border border-slate-800/80">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('password');
                setErrorMsg('');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium transition-all duration-150 ${
                authMethod === 'password'
                  ? 'bg-slate-900 text-teal-300 font-semibold border border-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_6px_rgba(0,0,0,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Password</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMethod('otp');
                setErrorMsg('');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium transition-all duration-150 ${
                authMethod === 'otp'
                  ? 'bg-slate-900 text-teal-300 font-semibold border border-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_6px_rgba(0,0,0,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email OTP</span>
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-slide-up">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* EMAIL OTP FLOW (SUPABASE AUTH) */}
          {authMethod === 'otp' && (
            <>
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="w-full"
                    isLoading={isLoading}
                    icon={ArrowRight}
                  >
                    Send Security Code
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                    <span className="truncate">{email}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false);
                        setOtpCode('');
                      }}
                      className="text-teal-400 hover:text-teal-300 text-[11px] underline shrink-0 font-medium"
                    >
                      Change
                    </button>
                  </div>

                  <Input
                    label="6-Digit Security Code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtpCode(digitsOnly);
                    }}
                    required
                    autoComplete="one-time-code"
                    autoFocus
                    className="font-mono text-center tracking-widest text-lg"
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="w-full"
                    isLoading={isLoading}
                    icon={LogIn}
                  >
                    Verify & Unlock Vault
                  </Button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isLoading}
                      className="text-xs text-slate-400 hover:text-teal-400 underline font-medium"
                    >
                      Resend code
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* PASSWORD FLOW */}
          {authMethod === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <div>
                <Input
                  label="Vault Password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <div className="flex justify-end mt-1.5">
                  <Link
                    href="/forgot-password"
                    className="text-[11px] text-slate-400 hover:text-teal-300 transition-colors underline font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full"
                  isLoading={isLoading}
                  icon={LogIn}
                >
                  Unlock Vault
                </Button>
              </div>
            </form>
          )}

          <div className="border-t border-slate-800 pt-4 text-center">
            <p className="text-xs text-slate-400">
              Don&apos;t have a vault yet?{' '}
              <Link href="/register" className="text-teal-400 hover:text-teal-300 font-semibold underline">
                Create an account
              </Link>
            </p>
          </div>
        </div>

        {/* Security Assurance Badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
          <span>Supabase Auth • AES-256-GCM Encrypted Vault</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <LoginContent />
    </Suspense>
  );
}
