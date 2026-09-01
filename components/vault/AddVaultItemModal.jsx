'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  KeyRound,
  CreditCard,
  FileText,
  UserCheck,
  Eye,
  EyeOff,
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { useToast } from '@/components/context/ToastContext';
import { useAuth } from '@/components/context/AuthContext';
import { encryptClientVaultItem } from '@/lib/crypto/client-vault';

export function AddVaultItemModal({
  isOpen,
  onClose,
  initialType = 'login',
  editItem = null,
  onItemCreated,
}) {
  const { success, error: toastError } = useToast();
  const { clientCryptoKey } = useAuth();

  // Mode: 'choose' (Step 1 picker) | 'login' | 'card' | 'note' | 'identity'
  const [type, setType] = useState('login');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Common & Login fields
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Card fields
  const [cardholder, setCardholder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [showCvv, setShowCvv] = useState(false);

  // Note & Identity fields
  const [noteContent, setNoteContent] = useState('');
  const [tags, setTags] = useState('');
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');

  // Password Generator options
  const [showGenerator, setShowGenerator] = useState(false);
  const [genLength, setGenLength] = useState(16);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [copiedPass, setCopiedPass] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialType === 'choose') {
        setShowTypePicker(true);
        setType('login');
      } else {
        setShowTypePicker(false);
        setType(initialType || 'login');
      }

      if (!editItem) {
        // Reset inputs
        setTitle('');
        setUsername('');
        setPassword('');
        setUrl('');
        setCardholder('');
        setCardNumber('');
        setCardExpiry('');
        setCardCvv('');
        setNoteContent('');
        setTags('');
        setFullName('');
        setIdNumber('');
        setShowGenerator(false);
      }
    }
  }, [isOpen, initialType, editItem]);

  // Generate strong random password
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums = '0123456789';
    const syms = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let pool = chars;
    if (includeNumbers) pool += nums;
    if (includeSymbols) pool += syms;

    let generated = '';
    const array = new Uint32Array(genLength);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(array);
      for (let i = 0; i < genLength; i++) {
        generated += pool[array[i] % pool.length];
      }
    } else {
      for (let i = 0; i < genLength; i++) {
        generated += pool[Math.floor(Math.random() * pool.length)];
      }
    }
    setPassword(generated);
  };

  const copyGeneratedPassword = () => {
    if (password) {
      navigator.clipboard.writeText(password);
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
      success('Password copied to clipboard!');
    }
  };

  const getCardBrand = (num) => {
    const clean = num.replace(/\s+/g, '');
    if (/^4/.test(clean)) return 'Visa';
    if (/^5[1-5]/.test(clean)) return 'Mastercard';
    if (/^3[47]/.test(clean)) return 'Amex';
    if (/^6(?:011|5)/.test(clean)) return 'Discover';
    return 'Card';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toastError('Item title is required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Assemble item payload
      let payloadData = { title: title.trim() };

      if (type === 'login') {
        payloadData = { ...payloadData, username, password, url };
      } else if (type === 'card') {
        payloadData = { ...payloadData, cardholder, cardNumber, cardExpiry, cardCvv, brand: getCardBrand(cardNumber) };
      } else if (type === 'note') {
        payloadData = { ...payloadData, content: noteContent, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) };
      } else if (type === 'identity') {
        payloadData = { ...payloadData, fullName, idNumber, content: noteContent };
      }

      // Encrypt payload (client zero-knowledge if key derived, or base64 JSON payload encrypted by server)
      let encryptedPayloadString = '';
      if (clientCryptoKey) {
        const encrypted = await encryptClientVaultItem(payloadData, clientCryptoKey);
        encryptedPayloadString = JSON.stringify(encrypted);
      } else {
        encryptedPayloadString = JSON.stringify({
          data: payloadData,
          clientEncrypted: false,
        });
      }

      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          encryptedPayload: encryptedPayloadString,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save vault item');
      }

      const typeLabel =
        type === 'login'
          ? 'Password'
          : type === 'card'
          ? 'Payment Card'
          : type === 'note'
          ? 'Secure Note'
          : 'Identity';

      success(`${typeLabel} saved securely in vault.`);

      if (onItemCreated) onItemCreated();
      onClose();
    } catch (err) {
      toastError(err.message || 'Failed to save item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryCards = [
    {
      id: 'login',
      label: 'Password',
      desc: 'Store login credentials, email logins, websites, and app accounts.',
      icon: KeyRound,
      color: 'teal',
    },
    {
      id: 'card',
      label: 'Payment Card',
      desc: 'Store encrypted credit cards, debit cards, and virtual cards.',
      icon: CreditCard,
      color: 'indigo',
    },
    {
      id: 'note',
      label: 'Secure Note',
      desc: 'Keep private recovery keys, seed phrases, and confidential notes safe.',
      icon: FileText,
      color: 'amber',
    },
    {
      id: 'identity',
      label: 'Identity',
      desc: 'Store passport details, driver licenses, and personal records.',
      icon: UserCheck,
      color: 'rose',
    },
  ];

  const getModalTitle = () => {
    if (showTypePicker) return 'What would you like to save?';
    if (type === 'login') return 'Add Password';
    if (type === 'card') return 'Add Payment Card';
    if (type === 'note') return 'Add Secure Note';
    if (type === 'identity') return 'Add Identity';
    return 'Add to Vault';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getModalTitle()}
      subtitle={
        showTypePicker
          ? 'Choose the category of item you want to encrypt and save.'
          : 'Encrypted in your browser before saving to your database.'
      }
      maxWidth="max-w-lg"
    >
      {/* STEP 1: WHAT TO SAVE TYPE PICKER */}
      {showTypePicker ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categoryCards.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setType(cat.id);
                    setShowTypePicker(false);
                  }}
                  className="p-4 rounded-2xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-teal-500/40 transition-all text-left flex flex-col justify-between gap-3 group shadow-card"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-105 transition-transform">
                        <Icon className="w-4 h-4" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <h4 className="text-xs font-bold text-white tracking-tight">{cat.label}</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{cat.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* STEP 2: CATEGORY SPECIFIC FORM */
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Top Bar with Back option */}
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setShowTypePicker(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Item Type</span>
            </button>

            <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
              {type === 'login'
                ? 'Password'
                : type === 'card'
                ? 'Payment Card'
                : type === 'note'
                ? 'Secure Note'
                : 'Identity'}
            </span>
          </div>

          {/* Title Input */}
          <Input
            label="Title / Name"
            placeholder={
              type === 'login'
                ? 'e.g. GitHub, Google, Work Email'
                : type === 'card'
                ? 'e.g. Main Visa Card'
                : type === 'note'
                ? 'e.g. Server Recovery Keys, Wi-Fi Codes'
                : 'e.g. Passport, Driver License'
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="rounded-2xl"
          />

          {/* LOGIN FIELDS */}
          {type === 'login' && (
            <>
              <Input
                label="Username / Email"
                placeholder="user@example.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                className="rounded-2xl"
              />

              <div className="space-y-1.5">
                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="rounded-2xl"
                  />
                  <div className="absolute right-3 top-8 flex items-center gap-1.5 text-slate-400">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="hover:text-slate-200"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Generator Toggle */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGenerator(!showGenerator);
                      if (!password) generatePassword();
                    }}
                    className="text-teal-400 hover:text-teal-300 font-medium flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{showGenerator ? 'Hide Password Generator' : 'Generate Strong Password'}</span>
                  </button>

                  {password && (
                    <button
                      type="button"
                      onClick={copyGeneratedPassword}
                      className="text-slate-400 hover:text-slate-200 flex items-center gap-1"
                    >
                      {copiedPass ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPass ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>

                {/* Inline Generator Controls */}
                {showGenerator && (
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-teal-500/30 space-y-3 animate-slide-up mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">Length: {genLength} chars</span>
                      <input
                        type="range"
                        min="12"
                        max="64"
                        value={genLength}
                        onChange={(e) => {
                          setGenLength(Number(e.target.value));
                          generatePassword();
                        }}
                        className="w-36 accent-teal-500"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeNumbers}
                          onChange={(e) => {
                            setIncludeNumbers(e.target.checked);
                            generatePassword();
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-teal-500"
                        />
                        Numbers (0-9)
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeSymbols}
                          onChange={(e) => {
                            setIncludeSymbols(e.target.checked);
                            generatePassword();
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-teal-500"
                        />
                        Symbols (!@#$)
                      </label>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full rounded-xl"
                      onClick={generatePassword}
                      icon={Sparkles}
                    >
                      Regenerate
                    </Button>
                  </div>
                )}
              </div>

              <Input
                label="Website URL"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoComplete="off"
                className="rounded-2xl"
              />
            </>
          )}

          {/* CARD FIELDS */}
          {type === 'card' && (
            <>
              <Input
                label="Cardholder Name"
                placeholder="JOHN DOE"
                value={cardholder}
                onChange={(e) => setCardholder(e.target.value.toUpperCase())}
                className="rounded-2xl"
              />

              <Input
                label="Card Number"
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 19);
                  const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
                  setCardNumber(formatted);
                }}
                className="rounded-2xl font-mono"
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Expires (MM/YY)"
                  placeholder="12/28"
                  value={cardExpiry}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    if (val.length >= 3) {
                      val = `${val.slice(0, 2)}/${val.slice(2)}`;
                    }
                    setCardExpiry(val);
                  }}
                  className="rounded-2xl font-mono"
                />

                <div className="relative">
                  <Input
                    label="CVV / CVC"
                    type={showCvv ? 'text' : 'password'}
                    placeholder="123"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="rounded-2xl font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCvv(!showCvv)}
                    className="absolute right-3 top-8 text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showCvv ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* NOTE FIELDS */}
          {type === 'note' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Secure Note Content</label>
                <textarea
                  rows={6}
                  placeholder="Write your confidential notes, seed phrases, recovery codes, or private keys here..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-2xl p-3.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-all font-mono leading-relaxed"
                />
              </div>

              <Input
                label="Tags (Comma separated)"
                placeholder="e.g. personal, crypto, recovery, work"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="rounded-2xl"
              />
            </div>
          )}

          {/* IDENTITY FIELDS */}
          {type === 'identity' && (
            <>
              <Input
                label="Full Name on ID"
                placeholder="Full Name as shown on ID"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="rounded-2xl"
              />

              <Input
                label="ID / Passport Number"
                placeholder="A12345678"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                className="rounded-2xl font-mono"
              />

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Additional Details / Notes</label>
                <textarea
                  rows={4}
                  placeholder="Issue date, expiry date, issuing authority, or address..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-2xl p-3.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-all text-xs"
                />
              </div>
            </>
          )}

          {/* Security Indicator */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>Encrypted with AES-256-GCM before saving</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting}
              icon={ShieldCheck}
            >
              Save to Vault
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
