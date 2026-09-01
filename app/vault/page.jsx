'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { VaultManager } from '@/components/vault/VaultManager';
import { AddVaultItemModal } from '@/components/vault/AddVaultItemModal';

function VaultContent() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type') || 'all';

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [modalType, setModalType] = useState('login');

  const handleOpenAdd = (type) => {
    setModalType(type || 'login');
    setAddModalOpen(true);
  };

  return (
    <>
      <VaultManager
        initialType={initialType}
        onOpenAddModal={handleOpenAdd}
      />

      <AddVaultItemModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        initialType={modalType}
        onItemCreated={() => {
          window.dispatchEvent(new CustomEvent('panda:vault:updated'));
        }}
      />
    </>
  );
}

export default function VaultPage() {
  return (
    <AppLayout
      title="Secure Vault"
      subtitle="Encrypted passwords, payment cards, secure notes, and digital identities."
    >
      <Suspense fallback={<div className="h-64 rounded-2xl bg-slate-900 animate-pulse" />}>
        <VaultContent />
      </Suspense>
    </AppLayout>
  );
}
