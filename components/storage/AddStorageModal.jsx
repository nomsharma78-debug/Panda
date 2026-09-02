'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Zap,
  ArrowLeft,
  HelpCircle,
  Eye,
  EyeOff,
  Cloud,
  Server,
  Database,
  Lock,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useToast } from '@/components/context/ToastContext';
import { PROVIDER_METADATA } from '@/lib/storage/provider-metadata';

export function AddStorageModal({ isOpen, onClose, onStorageAdded }) {
  const { success, error: toastError } = useToast();

  // Modal Stage: 'select' (Stage 1) | 'configure' (Stage 2)
  const [stage, setStage] = useState('select');
  const [selectedProvider, setSelectedProvider] = useState('r2');
  const [showGuide, setShowGuide] = useState(false);
  const [copiedCors, setCopiedCors] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [bucket, setBucket] = useState('');
  const [region, setRegion] = useState('');
  const [accountId, setAccountId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Testing & Saving state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setStage('select');
    setSelectedProvider('r2');
    setShowGuide(false);
    setCopiedCors(false);
    setName('');
    setEndpoint('');
    setAccessKey('');
    setSecretKey('');
    setBucket('');
    setRegion('');
    setAccountId('');
    setShowSecret(false);
    setTestResult(null);
    setIsTesting(false);
    setIsSaving(false);
  };

  const handleSelectProvider = (providerId) => {
    setSelectedProvider(providerId);
    const meta = PROVIDER_METADATA[providerId];
    setName(`My ${meta.name}`);
    setRegion(meta.defaults?.region || '');
    setEndpoint(meta.defaults?.endpoint || '');
    setAccountId('');
    setBucket('');
    setAccessKey('');
    setSecretKey('');
    setTestResult(null);
    setShowGuide(false);
    setStage('configure');
  };

  const handleCopyCors = (corsText) => {
    if (corsText) {
      navigator.clipboard.writeText(corsText);
      setCopiedCors(true);
      setTimeout(() => setCopiedCors(false), 2000);
      success('CORS configuration copied to clipboard!');
    }
  };

  const handleTestConnection = async () => {
    if (!name.trim()) {
      toastError('Please provide a connection name.');
      return;
    }

    if (!bucket.trim() || !accessKey.trim() || !secretKey.trim()) {
      toastError('Please fill in Bucket Name, Access Key, and Secret Key.');
      return;
    }

    if (selectedProvider === 'r2' && !accountId.trim()) {
      toastError('Cloudflare Account ID is required for R2.');
      return;
    }

    if (['b2', 'wasabi', 'minio', 'custom_s3'].includes(selectedProvider) && !endpoint.trim()) {
      toastError('Endpoint URL is required for this provider.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const payload = {
      provider: selectedProvider,
      name: name.trim(),
      endpoint: endpoint.trim() || undefined,
      accessKey: accessKey.trim(),
      secretKey: secretKey.trim(),
      bucket: bucket.trim(),
      region: region.trim() || undefined,
      accountId: accountId.trim() || undefined,
    };

    try {
      const res = await fetch('/api/storage/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setTestResult({
          success: false,
          error: data.error || 'Connection check failed: Access denied or invalid credentials.',
        });
        toastError(data.error || 'Storage connection test failed.');
      } else {
        setTestResult({
          success: true,
          message: data.message || 'Storage connection verified: live read/write test passed!',
        });
        success('Connection verified! You can now save and connect.');
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err.message || 'Network error communicating with Panda server.',
      });
      toastError('Connection test error.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConnection = async (e) => {
    if (e) e.preventDefault();

    if (!name.trim() || !bucket.trim() || !accessKey.trim() || !secretKey.trim()) {
      toastError('Please complete all required fields.');
      return;
    }

    setIsSaving(true);

    const payload = {
      provider: selectedProvider,
      name: name.trim(),
      endpoint: endpoint.trim() || undefined,
      accessKey: accessKey.trim(),
      secretKey: secretKey.trim(),
      bucket: bucket.trim(),
      region: region.trim() || undefined,
      accountId: accountId.trim() || undefined,
      isDefault,
    };

    try {
      const res = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toastError(data.error || 'Failed to save storage connection.');
      } else {
        success(`Connected to ${PROVIDER_METADATA[selectedProvider]?.name || 'storage'}!`);
        resetForm();
        onClose();
        if (onStorageAdded) onStorageAdded();
        window.dispatchEvent(new CustomEvent('panda:storage:updated'));
      }
    } catch (err) {
      toastError('Error saving storage connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentMeta = PROVIDER_METADATA[selectedProvider] || PROVIDER_METADATA.r2;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title={stage === 'select' ? 'Connect Cloud Storage' : `Connect ${currentMeta.name}`}
      subtitle={
        stage === 'select'
          ? 'Select your object storage provider. Your media stays 100% in your private bucket.'
          : `Configure credentials for your private ${currentMeta.name} bucket.`
      }
      maxWidth="max-w-2xl"
    >
      {/* ========================================================================= */}
      {/* STAGE 1: PROVIDER SELECTION TILES */}
      {/* ========================================================================= */}
      {stage === 'select' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {Object.values(PROVIDER_METADATA).map((provider) => {
              return (
                <div
                  key={provider.id}
                  className="group relative p-4 rounded-2xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-teal-500/40 transition-all flex flex-col justify-between gap-3 shadow-card"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-105 transition-transform">
                          <Cloud className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs font-bold text-white tracking-tight">{provider.name}</h4>
                      </div>
                      {provider.id === 'r2' && (
                        <span className="px-2 py-0.5 rounded-lg bg-teal-500/20 text-teal-300 text-[10px] font-semibold uppercase">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                      {provider.shortDesc}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProvider(provider.id);
                        handleSelectProvider(provider.id);
                        setShowGuide(true);
                      }}
                      className="text-[11px] font-medium text-teal-400 hover:text-teal-300 flex items-center gap-1"
                    >
                      <HelpCircle className="w-3 h-3" />
                      <span>Setup guide</span>
                    </button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSelectProvider(provider.id)}
                    >
                      Connect
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center gap-3 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
            <span>
              Panda never stores media files in PostgreSQL. Your photos, videos, and documents reside directly in your configured cloud storage.
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAGE 2: CREDENTIALS & CORS SETUP FORM */}
      {/* ========================================================================= */}
      {stage === 'configure' && (
        <form onSubmit={handleSaveConnection} className="space-y-5">
          {/* Back button & Provider Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setStage('select')}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Provider</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Configuring:</span>
              <span className="text-xs font-bold text-teal-400">{currentMeta.name}</span>
            </div>
          </div>

          {/* INLINE SETUP GUIDE & CORS CONFIGURATION DRAWER */}
          <div className="rounded-2xl bg-slate-950 border border-teal-500/30 overflow-hidden shadow-card">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between p-3.5 text-xs font-semibold text-teal-300 hover:bg-slate-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-teal-400" />
                <span>How to set up {currentMeta.name} & CORS Policy</span>
              </div>
              {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showGuide && (
              <div className="p-4 border-t border-slate-800 space-y-4 text-xs animate-slide-up">
                {/* Console Link */}
                {currentMeta.dashboardUrl && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300">
                    <span>Open your cloud provider console:</span>
                    <a
                      href={currentMeta.dashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition-all shrink-0 text-[11px]"
                    >
                      <span>Open {currentMeta.name}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Steps */}
                <div className="space-y-2">
                  <p className="font-semibold text-slate-200">Step-by-step Setup:</p>
                  {currentMeta.steps.map((st, i) => (
                    <div key={i} className="flex items-start gap-2 text-slate-400 text-[11px] leading-relaxed">
                      <span className="font-bold text-teal-400 shrink-0">{i + 1}.</span>
                      <div>
                        <strong className="text-slate-200">{st.title}: </strong>
                        <span>{st.description}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Copyable CORS Policy */}
                {currentMeta.corsPolicy && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 text-[11px]">
                        Bucket CORS Policy (Paste into {currentMeta.name} Bucket Permissions):
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCors(currentMeta.corsPolicy)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold text-[10px] transition-all border border-slate-700"
                      >
                        {copiedCors ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCors ? 'Copied!' : 'Copy CORS'}</span>
                      </button>
                    </div>
                    <pre className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-32 scrollbar-thin">
                      {currentMeta.corsPolicy}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="space-y-3.5">
            <Input
              label="Connection Display Name"
              type="text"
              placeholder="e.g. My Backblaze Storage"
              helperText="A friendly label for this bucket"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <Input
              label="Bucket Name"
              type="text"
              placeholder="e.g. panda-vault-media"
              helperText={`The exact name of your bucket in ${currentMeta.name}`}
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              required
            />

            {currentMeta.fields.includes('accountId') && (
              <Input
                label="Cloudflare Account ID"
                type="text"
                placeholder="32-character hexadecimal Account ID"
                helperText="Found on the right side of Cloudflare R2 overview"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
              />
            )}

            {currentMeta.fields.includes('endpoint') && (
              <Input
                label="S3 Endpoint URL"
                type="text"
                placeholder={currentMeta.defaults?.endpoint || 's3.us-west-004.backblazeb2.com'}
                helperText={selectedProvider === 'b2' ? 'Found under your Bucket Details in Backblaze (e.g. s3.us-west-004.backblazeb2.com)' : 'S3 API Endpoint URL'}
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                required
              />
            )}

            {currentMeta.fields.includes('region') && (
              <Input
                label="Region (Optional)"
                type="text"
                placeholder={currentMeta.defaults?.region || 'us-west-004'}
                helperText={selectedProvider === 'b2' ? 'e.g. us-west-004 (from your endpoint)' : 'e.g. us-east-1'}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            )}

            <Input
              label={selectedProvider === 'b2' ? 'Access Key ID (keyID)' : 'Access Key ID'}
              type="text"
              placeholder={selectedProvider === 'b2' ? 'Paste your Backblaze keyID' : 'Paste your Access Key ID'}
              helperText={selectedProvider === 'b2' ? 'In Backblaze -> Application Keys -> copy "keyID"' : 'Your cloud API Access Key'}
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              required
              autoComplete="off"
            />

            <div className="relative">
              <Input
                label={selectedProvider === 'b2' ? 'Secret Access Key (applicationKey)' : 'Secret Access Key'}
                type={showSecret ? 'text' : 'password'}
                placeholder={selectedProvider === 'b2' ? 'Paste your Backblaze applicationKey' : 'Paste your Secret Access Key'}
                helperText={selectedProvider === 'b2' ? 'In Backblaze -> Application Keys -> copy "applicationKey"' : 'Your cloud API Secret Key'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                required
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-8 text-slate-400 hover:text-slate-200"
                tabIndex={-1}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-teal-500 focus:ring-teal-500"
              />
              <label htmlFor="isDefault" className="text-xs text-slate-300 select-none cursor-pointer">
                Set as default storage connection for uploads
              </label>
            </div>
          </div>

          {/* Test Feedback */}
          {testResult && (
            <div
              className={`p-3.5 rounded-2xl border text-xs animate-slide-up flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              )}
              <span>{testResult.message || testResult.error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleTestConnection}
              isLoading={isTesting}
              disabled={isSaving}
            >
              Test Connection
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSaving}
              disabled={isTesting}
            >
              Save & Connect
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
