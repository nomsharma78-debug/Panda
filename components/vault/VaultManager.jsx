'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  KeyRound,
  CreditCard,
  FileText,
  UserCheck,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  Database,
} from 'lucide-react';
import { VaultItemCard } from './VaultItemCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';
import { decryptClientVaultItem } from '@/lib/crypto/client-vault';
import { pandaCache } from '@/lib/client-cache';
import { useCustomEvent } from '@/hooks/useCustomEvent';
import { useDebounce } from '@/hooks/useDebounce';
import { PANDA_EVENTS, VAULT_TYPES } from '@/lib/constants/index';

const TABS = [
  { id: VAULT_TYPES.ALL, label: 'All Items', icon: Layers },
  { id: VAULT_TYPES.LOGIN, label: 'Passwords', icon: KeyRound },
  { id: VAULT_TYPES.CARD, label: 'Cards', icon: CreditCard },
  { id: VAULT_TYPES.NOTE, label: 'Secure Notes', icon: FileText },
  { id: VAULT_TYPES.IDENTITY, label: 'Identities', icon: UserCheck },
];

export function VaultManager({ initialType = VAULT_TYPES.ALL, onOpenAddModal }) {
  const router = useRouter();
  const { session, clientCryptoKey } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState(initialType);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 200);

  const cacheKey = activeTab === VAULT_TYPES.ALL ? 'vault:all' : `vault:${activeTab}`;
  const cached = pandaCache.get(cacheKey);

  const [items, setItems] = useState(cached?.items || []);
  const [decryptedMap, setDecryptedMap] = useState(cached?.decryptedMap || {});
  const [loading, setLoading] = useState(!cached);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync state when URL parameter changes
  useEffect(() => {
    if (initialType) {
      setActiveTab(initialType);
    }
  }, [initialType]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    try {
      const newUrl = tabId === VAULT_TYPES.ALL ? '/vault' : `/vault?type=${tabId}`;
      window.history.replaceState(null, '', newUrl);
    } catch {}
  };

  const fetchItems = useCallback(async (force = false) => {
    const currentKey = 'vault:all';
    if (!force) {
      const cachedData = pandaCache.get(currentKey);
      if (cachedData) {
        setItems(cachedData.items || []);
        setDecryptedMap(cachedData.decryptedMap || {});
        setLoading(false);
        return;
      }
    }

    try {
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/vault', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const rawItems = data.items || [];
        setItems(rawItems);

        // Decrypt items in volatile memory
        const decrypted = {};
        for (const item of rawItems) {
          if (item.decryptedPayload) {
            decrypted[item.id] = item.decryptedPayload;
          } else {
            try {
              const parsedPayload = typeof item.encrypted_payload === 'string'
                ? JSON.parse(item.encrypted_payload)
                : item.encrypted_payload;

              if (parsedPayload?.data) {
                decrypted[item.id] = parsedPayload.data;
              } else if (parsedPayload?.ciphertext && clientCryptoKey) {
                const clear = await decryptClientVaultItem(parsedPayload, clientCryptoKey);
                decrypted[item.id] = clear;
              } else {
                decrypted[item.id] = { title: `${item.type} Item (Encrypted)` };
              }
            } catch {
              decrypted[item.id] = { title: `${item.type} Item` };
            }
          }
        }
        setDecryptedMap(decrypted);

        // Cache in volatile memory ONLY (never write decrypted secrets to disk/storage)
        pandaCache.set(currentKey, { items: rawItems, decryptedMap: decrypted }, 120_000, false);
      }
    } catch (err) {
      console.error('Fetch vault items error:', err);
    } finally {
      setLoading(false);
    }
  }, [clientCryptoKey, session?.access_token]);

  useEffect(() => {
    fetchItems(false);
  }, [fetchItems]);

  // Silent background revalidation on window focus and interval (0ms interruption)
  useEffect(() => {
    const handleFocus = () => fetchItems(true);
    window.addEventListener('focus', handleFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchItems(true);
      }
    }, 30_000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [fetchItems]);

  // Clean custom event listener using hook
  const handleVaultUpdated = useCallback(() => {
    pandaCache.invalidatePrefix('vault:');
    fetchItems(true);
  }, [fetchItems]);

  useCustomEvent(PANDA_EVENTS.VAULT_UPDATED, handleVaultUpdated);

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/vault/${deleteTarget.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });

      if (res.ok) {
        success('Item deleted successfully');
        setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
        setDeleteTarget(null);
        window.dispatchEvent(new CustomEvent(PANDA_EVENTS.VAULT_UPDATED));
      } else {
        toastError('Failed to delete item');
      }
    } catch {
      toastError('Network error deleting item');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter items by active tab category and debounced search query (0ms instant)
  const filteredItems = useMemo(() => {
    let list = items;
    if (activeTab !== VAULT_TYPES.ALL) {
      list = list.filter((item) => (item.type || '').toLowerCase() === activeTab.toLowerCase());
    }
    if (debouncedSearch && debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim();
      list = list.filter((item) => {
        const data = decryptedMap[item.id] || {};
        const title = (data.title || item.title || item.name || '').toLowerCase();
        const username = (data.username || data.email || '').toLowerCase();
        const notes = (data.notes || data.content || '').toLowerCase();
        const url = (data.url || item.url || '').toLowerCase();
        return title.includes(q) || username.includes(q) || notes.includes(q) || url.includes(q);
      });
    }
    return list;
  }, [items, activeTab, decryptedMap, debouncedSearch]);

  const getEmptyStateDetails = () => {
    if (debouncedSearch) {
      return {
        icon: Search,
        title: 'No matching items found',
        description: `No vault items matched "${debouncedSearch}". Try a different search keyword.`,
        actionLabel: 'Clear Search',
        actionIcon: Plus,
        onAction: () => setSearchInput(''),
      };
    }

    switch (activeTab) {
      case VAULT_TYPES.LOGIN:
        return {
          icon: KeyRound,
          title: 'No passwords saved yet',
          description: 'Store and encrypt login credentials, usernames, and master secrets.',
          actionLabel: 'Add Password',
          actionIcon: Plus,
          onAction: () => onOpenAddModal('login'),
        };
      case VAULT_TYPES.CARD:
        return {
          icon: CreditCard,
          title: 'No payment cards saved yet',
          description: 'Store encrypted credit cards, debit cards, and banking details.',
          actionLabel: 'Add Payment Card',
          actionIcon: Plus,
          onAction: () => onOpenAddModal('card'),
        };
      case VAULT_TYPES.NOTE:
        return {
          icon: FileText,
          title: 'No secure notes saved yet',
          description: 'Keep private recovery phrases, API keys, and sensitive notes encrypted.',
          actionLabel: 'Add Secure Note',
          actionIcon: Plus,
          onAction: () => onOpenAddModal('note'),
        };
      case VAULT_TYPES.IDENTITY:
        return {
          icon: UserCheck,
          title: 'No identities saved yet',
          description: 'Securely store passports, driver licenses, and personal identity records.',
          actionLabel: 'Add Identity',
          actionIcon: Plus,
          onAction: () => onOpenAddModal('identity'),
        };
      default:
        return {
          icon: ShieldCheck,
          title: 'Your digital vault is empty',
          description: 'Store passwords, payment cards, secure notes, and identities.',
          actionLabel: 'Add to Vault',
          actionIcon: Plus,
          onAction: () => onOpenAddModal('choose'),
        };
    }
  };

  const emptyConfig = getEmptyStateDetails();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Ready Immediately Notification Banner */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between text-xs text-slate-300 shadow-subtle">
        <div className="flex items-center gap-2.5">
          <Database className="w-4 h-4 text-teal-400 shrink-0" />
          <span>
            Passwords, cards, and secure notes are encrypted and stored in Panda&apos;s database. <strong>External cloud storage is NOT required.</strong>
          </span>
        </div>
        <span className="text-[11px] text-teal-400 font-mono shrink-0 hidden md:inline bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
          AES-256-GCM
        </span>
      </div>

      {/* Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                  active
                    ? 'bg-slate-900 text-teal-300 font-semibold border border-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_6px_rgba(0,0,0,0.3)]'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-teal-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search & Add Controls */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter items..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500/80 focus:ring-1 focus:ring-teal-500/20"
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => onOpenAddModal(activeTab === VAULT_TYPES.ALL ? 'login' : activeTab)}
            className="rounded-xl shrink-0"
          >
            <span>Add Item</span>
          </Button>
        </div>
      </div>

      {/* Item List / Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-44 rounded-2xl bg-slate-900/60 border border-slate-800/60 animate-pulse"
            />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={emptyConfig.icon}
          title={emptyConfig.title}
          description={emptyConfig.description}
          actionLabel={emptyConfig.actionLabel}
          onAction={emptyConfig.onAction}
          actionIcon={emptyConfig.actionIcon}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <VaultItemCard
              key={item.id}
              item={item}
              decryptedData={decryptedMap[item.id]}
              onDelete={(target) => setDeleteTarget(target)}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteItem}
        title="Delete Vault Item"
        description={`Are you sure you want to permanently delete "${
          decryptedMap[deleteTarget?.id]?.title || 'this item'
        }"? This action cannot be reversed.`}
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
