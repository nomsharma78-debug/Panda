'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PandaLogo } from '@/components/ui/PandaLogo';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';
import { ShieldCheck, UserPlus, AlertCircle, ArrowRight, LogIn, Mail, Lock } from 'lucide-react';

export default function RegisterPage() {
  const { signInWithOtp, verifyOtp } = useAuth();
  const { success } = useToast();

  const [step, setStep] = useState(1); // 1: Name, Email, Password | 2: Verify OTP & Save to DB
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Password criteria indicators
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  // STEP 1: Submit Details -> Send Email OTP
  const handleInitiateRegistration = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter your full name');
      return;
    }

    if (!email) {
      setErrorMsg('Please enter a valid email address');
      return;
    }

    if (!hasMinLength || !hasUpper || !hasLower || !hasNumber) {
      setErrorMsg('Please satisfy all password strength requirements.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await signInWithOtp(email, name, true);
      setStep(2);
      success('6-digit security code sent to your email!');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send security code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 2: Verify OTP -> Store details in DB & Activate Vault
  const handleVerifyAndActivate = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!otpCode || otpCode.length < 6) {
      setErrorMsg('Please enter the 6-digit security code sent to your email');
      return;
    }

    setIsLoading(true);
    try {
      await verifyOtp(email, otpCode, name, password);
      success(`Welcome to Panda Vault, ${name.trim()}!`);
    } catch (err) {
      setErrorMsg(err.message || 'Invalid or expired code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-4">
          <PandaLogo size="lg" />
        </div>
        <p className="text-xs text-slate-400 font-medium">
          Create your private, end-to-end encrypted personal digital vault
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-teal-400" />
              <span>{step === 1 ? 'Create Personal Vault' : 'Verify Email Security Code'}</span>
            </h2>
            <p className="text-xs text-slate-400">
              {step === 1
                ? 'Enter your name, email, and master password to get started.'
                : 'Enter the 6-digit code sent to your email to verify and activate your vault.'}
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-slide-up">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: NAME, EMAIL, PASSWORD FORM */}
          {step === 1 && (
            <form onSubmit={handleInitiateRegistration} className="space-y-4">
              <Input
                label="Full Name"
                type="text"
                placeholder="Alex Morgan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                autoFocus
              />

              <Input
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <Input
                label="Master Password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />

              {password && (
                <div className="grid grid-cols-2 gap-1.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className={hasMinLength ? 'text-teal-400' : 'text-slate-600'}>
                      {hasMinLength ? '✓' : '○'}
                    </span>
                    <span>8+ Characters</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={hasUpper ? 'text-teal-400' : 'text-slate-600'}>
                      {hasUpper ? '✓' : '○'}
                    </span>
                    <span>Uppercase Letter</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={hasLower ? 'text-teal-400' : 'text-slate-600'}>
                      {hasLower ? '✓' : '○'}
                    </span>
                    <span>Lowercase Letter</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={hasNumber ? 'text-teal-400' : 'text-slate-600'}>
                      {hasNumber ? '✓' : '○'}
                    </span>
                    <span>Number</span>
                  </div>
                </div>
              )}

              <Input
                label="Confirm Password"
                type="password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full"
                  isLoading={isLoading}
                  icon={ArrowRight}
                >
                  Send Verification Code
                </Button>
              </div>
            </form>
          )}

          {/* STEP 2: VERIFY OTP & ACTIVATE */}
          {step === 2 && (
            <form onSubmit={handleVerifyAndActivate} className="space-y-4">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{name}</p>
                  <p className="text-slate-400 text-[11px] truncate">{email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtpCode('');
                  }}
                  className="text-teal-400 hover:text-teal-300 text-[11px] underline shrink-0 font-medium ml-2"
                >
                  Change
                </button>
              </div>

              <Input
                label="6-Digit Verification Code"
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
                Verify & Activate Vault
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleInitiateRegistration}
                  disabled={isLoading}
                  className="text-xs text-slate-400 hover:text-teal-400 underline font-medium"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          {/* Security Badge */}
          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 flex items-center gap-2.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
            <span>Zero-knowledge encryption. Details are verified & stored securely.</span>
          </div>

          {/* Login Link */}
          <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800">
            Already have a vault?{' '}
            <Link href="/login" className="text-teal-400 hover:text-teal-300 font-semibold underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
