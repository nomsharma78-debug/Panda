'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PandaLogo } from '@/components/ui/PandaLogo';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';
import { ShieldCheck, KeyRound, AlertCircle, ArrowRight, CheckCircle2, Lock, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { resetPasswordForEmail, updateUserPasswordWithOtp } = useAuth();
  const { success } = useToast();

  const [step, setStep] = useState(1); // 1: Request Code | 2: Verify Code & Set New Password
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Password criteria indicators
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);

  // Step 1: Send Reset Code
  const handleSendResetCode = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email) {
      setErrorMsg('Please enter your email address');
      return;
    }

    setIsLoading(true);
    try {
      await resetPasswordForEmail(email);
      setStep(2);
      success('6-digit security code sent to your email!');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send reset code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify Code and Reset Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!otpCode || otpCode.length < 6) {
      setErrorMsg('Please enter the 6-digit security code sent to your email');
      return;
    }

    if (!hasMinLength || !hasUpper || !hasLower || !hasNumber) {
      setErrorMsg('Please satisfy all password strength requirements.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await updateUserPasswordWithOtp(email, otpCode, newPassword, confirmPassword);
      success('Password reset successfully! You can now sign in.');
      router.push('/login');
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
          Recover access to your encrypted personal digital vault
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-400" />
              <span>{step === 1 ? 'Forgot Vault Password' : 'Set New Master Password'}</span>
            </h2>
            <p className="text-xs text-slate-400">
              {step === 1
                ? 'Enter your registered email to receive a 6-digit password reset code.'
                : 'Enter the 6-digit code sent to your email and create your new password.'}
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-slide-up">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: REQUEST RESET CODE */}
          {step === 1 && (
            <form onSubmit={handleSendResetCode} className="space-y-4">
              <Input
                label="Registered Email Address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                isLoading={isLoading}
                icon={ArrowRight}
              >
                Send Reset Code
              </Button>
            </form>
          )}

          {/* STEP 2: VERIFY CODE & SET NEW PASSWORD */}
          {step === 2 && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                <span className="truncate">{email}</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtpCode('');
                  }}
                  className="text-teal-400 hover:text-teal-300 text-[11px] underline shrink-0 font-medium"
                >
                  Change
                </button>
              </div>

              <Input
                label="6-Digit Reset Code"
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

              <Input
                label="New Master Password"
                type="password"
                placeholder="••••••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
              />

              {newPassword && (
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
                label="Confirm New Password"
                type="password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                isLoading={isLoading}
                icon={Lock}
              >
                Reset Password & Save
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleSendResetCode}
                  disabled={isLoading}
                  className="text-xs text-slate-400 hover:text-teal-400 underline font-medium"
                >
                  Resend reset code
                </button>
              </div>
            </form>
          )}

          {/* Back to Login */}
          <div className="border-t border-slate-800 pt-4 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-300 font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign in</span>
            </Link>
          </div>
        </div>

        {/* Security Assurance Badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
          <span>Argon2id Hash Protected • Session Isolation</span>
        </div>
      </div>
    </div>
  );
}
