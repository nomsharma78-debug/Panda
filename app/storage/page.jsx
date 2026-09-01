'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StorageManager } from '@/components/storage/StorageManager';
import { AddStorageModal } from '@/components/storage/AddStorageModal';

export default function StoragePage() {
  const [addModalOpen, setAddModalOpen] = useState(false);

  return (
    <AppLayout
      title="Storage Hub"
      subtitle="Connect, manage, and scale your personal cloud storage providers in one unified library."
    >
      <StorageManager onOpenAddModal={() => setAddModalOpen(true)} />

      <AddStorageModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onStorageAdded={() => {
          window.dispatchEvent(new CustomEvent('panda:storage:updated'));
        }}
      />
    </AppLayout>
  );
}
