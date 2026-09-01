'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PandaLogo } from '@/components/ui/PandaLogo';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';
import { ShieldCheck, UserPlus, AlertCircle, ArrowRight, LogIn, Lock } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const { success } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Password criteria indicators
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  const handleRegister = async (e) => {
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
      setErrorMsg('Password must be at least 8 characters with uppercase, lowercase, and numbers.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await register(email, password, confirmPassword, name);
      success(`Welcome to Panda Vault, ${name.trim()}!`);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create account. Please try again.');
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
              <span>Create Personal Vault</span>
            </h2>
            <p className="text-xs text-slate-400">
              Enter your name, email, and master password to get started instantly.
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-slide-up">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
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
              <div className={`p-1.5 rounded-xl text-[10px] text-center border font-mono transition-colors ${
                hasMinLength ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}>
                8+ Chars
              </div>
              <div className={`p-1.5 rounded-xl text-[10px] text-center border font-mono transition-colors ${
                hasUpper ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}>
                Uppercase
              </div>
              <div className={`p-1.5 rounded-xl text-[10px] text-center border font-mono transition-colors ${
                hasLower ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}>
                Lowercase
              </div>
              <div className={`p-1.5 rounded-xl text-[10px] text-center border font-mono transition-colors ${
                hasNumber ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}>
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
              Create Account & Open Vault
            </Button>
          </form>

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
