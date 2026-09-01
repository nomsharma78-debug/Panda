'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { MediaUploadModal } from '@/components/media/MediaUploadModal';
import { AddVaultItemModal } from '@/components/vault/AddVaultItemModal';
import { AddStorageModal } from '@/components/storage/AddStorageModal';

export default function DashboardPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addVaultOpen, setAddVaultOpen] = useState(false);
  const [vaultType, setVaultType] = useState('login');
  const [addStorageOpen, setAddStorageOpen] = useState(false);

  const handleOpenAddVault = (type = 'login') => {
    setVaultType(type);
    setAddVaultOpen(true);
  };

  return (
    <AppLayout
      title="Vault Dashboard"
      subtitle="Overview of your encrypted credentials, cards, notes, and cloud media."
    >
      <DashboardOverview
        onOpenUpload={() => setUploadOpen(true)}
        onOpenAddVaultItem={handleOpenAddVault}
        onOpenAddStorage={() => setAddStorageOpen(true)}
      />

      <MediaUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploadSuccess={() => {
          window.location.reload();
        }}
      />

      <AddVaultItemModal
        isOpen={addVaultOpen}
        onClose={() => setAddVaultOpen(false)}
        initialType={vaultType}
        onItemCreated={() => {
          window.location.reload();
        }}
      />

      <AddStorageModal
        isOpen={addStorageOpen}
        onClose={() => setAddStorageOpen(false)}
        onStorageAdded={() => {
          window.location.reload();
        }}
      />
    </AppLayout>
  );
}
