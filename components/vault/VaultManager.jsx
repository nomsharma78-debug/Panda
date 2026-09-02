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
  Lock,
} from 'lucide-react';
import { VaultItemCard } from './VaultItemCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/components/context/AuthContext';
import { useToast } from '@/components/context/ToastContext';
import { decryptClientVaultItem } from '@/lib/crypto/client-vault';

export function VaultManager({ initialType = 'all', onOpenAddModal }) {
  const router = useRouter();
  const { session, clientCryptoKey } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState(initialType);
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState([]);
  const [decryptedMap, setDecryptedMap] = useState({});
  const [loading, setLoading] = useState(true);
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
    if (tabId === 'all') {
      router.push('/vault');
    } else {
      router.push(`/vault?type=${tabId}`);
    }
  };

  const fetchItems = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent && !initialLoadedRef.current) {
        setLoading(true);
      }
      const url = activeTab === 'all' ? '/api/vault' : `/api/vault?type=${activeTab}`;
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        const rawItems = data.items || [];
        setItems(rawItems);

        // Decrypt items in memory
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
            } catch (e) {
              decrypted[item.id] = { title: `${item.type} Item` };
            }
          }
        }
        setDecryptedMap(decrypted);
      }
    } catch (err) {
      console.error('Fetch vault items error:', err);
    } finally {
      initialLoadedRef.current = true;
      setLoading(false);
    }
  }, [activeTab, clientCryptoKey, session]);

  const initialLoadedRef = React.useRef(false);

  useEffect(() => {
    fetchItems(initialLoadedRef.current);
  }, [fetchItems]);

  useEffect(() => {
    const handleVaultUpdated = () => fetchItems();
    window.addEventListener('panda:vault:updated', handleVaultUpdated);
    return () => window.removeEventListener('panda:vault:updated', handleVaultUpdated);
  }, [fetchItems]);

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
      });

      if (res.ok) {
        success('Item deleted successfully');
        setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
        setDeleteTarget(null);
        window.dispatchEvent(new CustomEvent('panda:vault:updated'));
      } else {
        toastError('Failed to delete item');
      }
    } catch (err) {
      toastError('Network error deleting item');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter items by client-side search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => {
      const data = decryptedMap[item.id] || {};
      const title = (data.title || '').toLowerCase();
      const username = (data.username || '').toLowerCase();
      const notes = (data.notes || data.content || '').toLowerCase();
      const url = (data.url || '').toLowerCase();
      return title.includes(q) || username.includes(q) || notes.includes(q) || url.includes(q);
    });
  }, [items, decryptedMap, searchQuery]);

  const tabs = [
    { id: 'all', label: 'All Items', icon: Layers },
    { id: 'login', label: 'Passwords', icon: KeyRound },
    { id: 'card', label: 'Cards', icon: CreditCard },
    { id: 'note', label: 'Secure Notes', icon: FileText },
    { id: 'identity', label: 'Identities', icon: UserCheck },
  ];

  const getEmptyStateDetails = () => {
    if (searchQuery) {
      return {
        icon: Search,
        title: 'No matching items found',
        description: `No vault items matched "${searchQuery}". Try a different search keyword.`,
        actionLabel: 'Clear Search',
        actionIcon: Plus,
        onAction: () => setSearchQuery(''),
      };
    }

    switch (activeTab) {
      case 'login':
        return {
          icon: KeyRound,
          title: 'No passwords saved yet',
          description: 'Store and encrypt login credentials, usernames, and master secrets.',
          actionLabel: 'Add Password',
          actionIcon: Plus,
          onAction: () => onOpenAddModal('login'),
        };
      case 'card':
        return {
          icon: CreditCard,
          title: 'No payment cards saved yet',
          description: 'Store encrypted credit cards, debit cards, and banking details.',
          actionLabel: 'Add Payment Card',
          actionIcon: Plus,
          onAction: () => onOpenAddModal('card'),
        };
      case 'note':
        return {
          icon: FileText,
          title: 'No secure notes saved yet',
          description: 'Keep private recovery phrases, API keys, and sensitive notes encrypted.',
          actionLabel: 'Add Secure Note',
          actionIcon: Plus,
          onAction: () => onOpenAddModal('note'),
        };
      case 'identity':
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
          {tabs.map((tab) => {
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter items..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500/80 focus:ring-1 focus:ring-teal-500/20"
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => onOpenAddModal(activeTab === 'all' ? 'login' : activeTab)}
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
