'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PandaLogo } from '@/components/ui/PandaLogo';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';
import { ShieldCheck, UserPlus, AlertCircle, ArrowRight, LogIn, Mail, CheckCircle2, RotateCw } from 'lucide-react';

export default function RegisterPage() {
  const { signInWithOtp, verifyOtp } = useAuth();
  const { success } = useToast();

  const [step, setStep] = useState(1); // Step 1: Account Details | Step 2: 6-Digit OTP Verification
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Password criteria indicators
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Step 1: Submit details and send OTP
  const handleSendVerification = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!hasMinLength || !hasUpper || !hasLower || !hasNumber) {
      setErrorMsg('Password must be at least 8 characters with uppercase, lowercase, and numbers.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await signInWithOtp(email.trim(), name.trim(), true);
      setStep(2);
      setResendCooldown(60);
      success('6-digit verification code sent to your email!');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP and finalize account creation
  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanCode = otpCode.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    setIsLoading(true);
    try {
      await verifyOtp(email.trim(), cleanCode, name.trim(), password);
      success(`Welcome to Panda Vault, ${name.trim()}!`);
    } catch (err) {
      setErrorMsg(err.message || 'Invalid or expired verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP in Step 2
  const handleResendCode = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setErrorMsg('');
    setIsLoading(true);
    try {
      await signInWithOtp(email.trim(), name.trim(), true);
      setResendCooldown(60);
      success('A fresh verification code has been sent!');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to resend code. Please try again.');
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
          
          {/* Header */}
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              {step === 1 ? (
                <>
                  <UserPlus className="w-4 h-4 text-teal-400" />
                  <span>Create Personal Vault</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 text-teal-400" />
                  <span>Verify Email Address</span>
                </>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              {step === 1
                ? 'Enter your name, email, and master password to get started.'
                : 'Enter the 6-digit security code sent to your email to verify and unlock your vault.'}
            </p>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-slide-up">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: INITIAL REGISTRATION FORM (No OTP box here) */}
          {step === 1 && (
            <form onSubmit={handleSendVerification} className="space-y-4">
              <Input
                label="Full Name"
                type="text"
                placeholder="Alex Morgan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                autoFocus
                className="rounded-2xl"
              />

              <Input
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="rounded-2xl"
              />

              <Input
                label="Master Password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="rounded-2xl"
              />

              {/* Password strength visual pill indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                <div
                  className={`p-1.5 rounded-xl text-[10px] text-center border font-mono transition-colors ${
                    hasMinLength ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  8+ Chars
                </div>
                <div
                  className={`p-1.5 rounded-xl text-[10px] text-center border font-mono transition-colors ${
                    hasUpper ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  Uppercase
                </div>
                <div
                  className={`p-1.5 rounded-xl text-[10px] text-center border font-mono transition-colors ${
                    hasLower ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  Lowercase
                </div>
                <div
                  className={`p-1.5 rounded-xl text-[10px] text-center border font-mono transition-colors ${
                    hasNumber ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  Number
                </div>
              </div>

              <Input
                label="Confirm Master Password"
                type="password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="rounded-2xl"
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full rounded-2xl"
                isLoading={isLoading}
                icon={ArrowRight}
              >
                Send Verification Code
              </Button>
            </form>
          )}

          {/* STEP 2: OTP VERIFICATION (Shown ONLY after code is sent) */}
          {step === 2 && (
            <form onSubmit={handleVerifyAndRegister} className="space-y-4">
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="truncate font-medium">{email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtpCode('');
                    setErrorMsg('');
                  }}
                  className="text-teal-400 hover:text-teal-300 text-[11px] underline shrink-0 font-medium ml-2"
                >
                  Change
                </button>
              </div>

              <div>
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
                  className="font-mono text-center tracking-widest text-lg rounded-2xl"
                />
                <p className="text-[11px] text-slate-500 text-center mt-1.5">
                  Check your inbox and spam folder for the code
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full rounded-2xl"
                isLoading={isLoading}
                icon={ShieldCheck}
              >
                Verify & Create Vault
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0 || isLoading}
                  className={`text-xs inline-flex items-center gap-1.5 underline font-medium ${
                    resendCooldown > 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-teal-400'
                  }`}
                >
                  <RotateCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend verification code'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="pt-2 border-t border-slate-800/80 text-center">
            <p className="text-xs text-slate-400">
              Already have a vault?{' '}
              <Link href="/login" className="text-teal-400 hover:text-teal-300 font-semibold inline-flex items-center gap-1">
                <span>Sign in here</span>
                <LogIn className="w-3 h-3" />
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
          <span>Zero-Knowledge • End-to-End Encrypted with AES-256-GCM</span>
        </div>
      </div>
    </div>
  );
}
