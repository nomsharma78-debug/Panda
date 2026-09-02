'use client';

import React, { useState } from 'react';
import {
  KeyRound,
  CreditCard,
  FileText,
  UserCheck,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { useToast } from '@/components/context/ToastContext';
import { Badge } from '@/components/ui/Badge';

export function VaultItemCard({ item, decryptedData, onDelete }) {
  const { success } = useToast();
  const [showSensitive, setShowSensitive] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const type = item.type;
  const data = decryptedData || {};

  const handleCopy = (text, keyName = 'value') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    success(`Copied ${keyName} to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getCategoryIcon = () => {
    switch (type) {
      case 'login':
        return <KeyRound className="w-4 h-4 text-teal-400" />;
      case 'card':
        return <CreditCard className="w-4 h-4 text-indigo-400" />;
      case 'note':
        return <FileText className="w-4 h-4 text-emerald-400" />;
      case 'identity':
        return <UserCheck className="w-4 h-4 text-amber-400" />;
      default:
        return <Lock className="w-4 h-4 text-slate-400" />;
    }
  };

  const categoryLabel = {
    login: 'Password',
    card: 'Card',
    note: 'Secure Note',
    identity: 'Identity',
  }[type] || type;

  return (
    <div className="bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/90 rounded-2xl p-4 sm:p-5 shadow-card transition-all duration-200 flex flex-col justify-between gap-4 hover:-translate-y-0.5">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 shrink-0 shadow-subtle">
              {getCategoryIcon()}
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-semibold text-white tracking-tight truncate">{data.title || 'Untitled Item'}</h4>
              <Badge variant="default" size="sm" className="mt-0.5 text-[10px]">
                {categoryLabel}
              </Badge>
            </div>
          </div>

          <button
            onClick={() => onDelete(item)}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 transition-colors shrink-0"
            title="Delete item"
            aria-label="Delete item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Details */}
        <div className="space-y-2 text-xs bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 font-mono">
          {type === 'login' && (
            <>
              {data.username && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 truncate max-w-[140px]">{data.username}</span>
                  <button
                    onClick={() => handleCopy(data.username, 'username')}
                    className="text-slate-400 hover:text-teal-300 p-1 transition-colors"
                    title="Copy Username"
                  >
                    {copiedKey === 'username' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {data.password && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-200">
                    {showSensitive ? data.password : '••••••••••••'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowSensitive(!showSensitive)}
                      className="text-slate-400 hover:text-slate-200 p-1 transition-colors"
                      title={showSensitive ? 'Hide Password' : 'Show Password'}
                    >
                      {showSensitive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleCopy(data.password, 'password')}
                      className="text-slate-400 hover:text-teal-300 p-1 transition-colors"
                      title="Copy Password"
                    >
                      {copiedKey === 'password' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {data.url && (
                <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-teal-400">
                  <span className="truncate max-w-[180px] font-sans">{data.url}</span>
                  <a
                    href={data.url.startsWith('http') ? data.url : `https://${data.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </>
          )}

          {type === 'card' && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">
                  {showSensitive ? data.cardNumber : (data.cardNumber ? `•••• •••• •••• ${data.cardNumber.slice(-4)}` : '••••')}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowSensitive(!showSensitive)}
                    className="text-slate-400 hover:text-slate-200 p-1 transition-colors"
                  >
                    {showSensitive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleCopy(data.cardNumber?.replace(/\s/g, ''), 'card number')}
                    className="text-slate-400 hover:text-teal-300 p-1 transition-colors"
                  >
                    {copiedKey === 'card number' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Exp: {data.cardExpiry || 'N/A'}</span>
                <span>CVV: {showSensitive ? data.cardCvv : '•••'}</span>
              </div>
            </>
          )}

          {type === 'note' && (
            <div className="text-slate-300 font-sans text-xs whitespace-pre-wrap line-clamp-3 leading-relaxed">
              {data.content || 'Empty note'}
            </div>
          )}

          {type === 'identity' && (
            <div className="space-y-1">
              {data.fullName && <p className="text-slate-200 font-sans">{data.fullName}</p>}
              {data.idNumber && (
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>ID: {data.idNumber}</span>
                  <button
                    onClick={() => handleCopy(data.idNumber, 'ID')}
                    className="p-1 hover:text-teal-300 transition-colors"
                  >
                    {copiedKey === 'ID' ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>Updated {new Date(item.updated_at).toLocaleDateString()}</span>
        <span className="text-teal-400 font-mono flex items-center gap-1">
          <Lock className="w-3 h-3" />
          <span>Encrypted</span>
        </span>
      </div>
    </div>
  );
}
