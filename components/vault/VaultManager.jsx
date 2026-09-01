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

  // Sync state when URL parameter changes (e.g. from Sidebar or Dashboard click)
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

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
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
          try {
            const parsedPayload = JSON.parse(item.encrypted_payload);
            if (parsedPayload.data) {
              decrypted[item.id] = parsedPayload.data;
            } else if (parsedPayload.ciphertext && clientCryptoKey) {
              const clear = await decryptClientVaultItem(parsedPayload, clientCryptoKey);
              decrypted[item.id] = clear;
            } else {
              decrypted[item.id] = { title: `${item.type} Item (Encrypted)` };
            }
          } catch (e) {
            decrypted[item.id] = { title: `${item.type} Item` };
          }
        }
        setDecryptedMap(decrypted);
      }
    } catch (err) {
      console.error('Fetch vault items error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, clientCryptoKey]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const handleVaultUpdated = () => fetchItems();
    window.addEventListener('panda:vault:updated', handleVaultUpdated);
    return () => window.removeEventListener('panda:vault:updated', handleVaultUpdated);
  }, [fetchItems]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const dec = decryptedMap[item.id] || {};
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      const titleMatch = (dec.title || '').toLowerCase().includes(q);
      const userMatch = (dec.username || '').toLowerCase().includes(q);
      const urlMatch = (dec.url || '').toLowerCase().includes(q);
      const contentMatch = (dec.content || '').toLowerCase().includes(q);

      return titleMatch || userMatch || urlMatch || contentMatch;
    });
  }, [items, decryptedMap, searchQuery]);

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/vault/${deleteTarget.id}`, { method: 'DELETE', headers });
      if (res.ok) {
        success('Vault item deleted.');
        fetchItems();
      } else {
        toastError('Failed to delete item');
      }
    } catch {
      toastError('Network error deleting item');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const tabs = [
    { id: 'all', label: 'All Items', icon: Layers },
    { id: 'login', label: 'Passwords', icon: KeyRound },
    { id: 'card', label: 'Cards', icon: CreditCard },
    { id: 'note', label: 'Secure Notes', icon: FileText },
    { id: 'identity', label: 'Identities', icon: UserCheck },
  ];

  // Section-specific empty state details
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
    <div className="space-y-6">
      {/* Ready Immediately Notification Banner */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2.5">
          <Database className="w-4 h-4 text-teal-400 shrink-0" />
          <span>
            Passwords, cards, and secure notes are encrypted and stored in Panda&apos;s database. <strong>External cloud storage is NOT required.</strong>
          </span>
        </div>
        <span className="text-[11px] text-teal-400 font-mono shrink-0 hidden md:inline">
          AES-256-GCM
        </span>
      </div>

      {/* Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  active
                    ? 'bg-teal-500 text-slate-950 font-semibold shadow-glow-teal'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search and Add Button */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vault..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => onOpenAddModal(activeTab === 'all' ? 'choose' : activeTab)}
          >
            {activeTab === 'login'
              ? 'Add Password'
              : activeTab === 'card'
              ? 'Add Card'
              : activeTab === 'note'
              ? 'Add Note'
              : activeTab === 'identity'
              ? 'Add Identity'
              : 'Add Item'}
          </Button>
        </div>
      </div>

      {/* Vault Items Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={emptyConfig.icon}
          title={emptyConfig.title}
          description={emptyConfig.description}
          actionLabel={emptyConfig.actionLabel}
          actionIcon={emptyConfig.actionIcon}
          onAction={emptyConfig.onAction}
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

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Vault Item?"
        message="Are you sure you want to permanently delete this item from your encrypted vault? This action cannot be undone."
        confirmText="Delete Item"
        confirmVariant="danger"
        isLoading={isDeleting}
        onConfirm={executeDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
