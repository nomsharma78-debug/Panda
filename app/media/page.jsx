'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { MediaGallery } from '@/components/media/MediaGallery';
import { MediaUploadModal } from '@/components/media/MediaUploadModal';
import { AddStorageModal } from '@/components/storage/AddStorageModal';

export default function MediaPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [addStorageOpen, setAddStorageOpen] = useState(false);

  return (
    <AppLayout
      title="Media Library"
      subtitle="Unified chronological gallery for photos, videos, PDFs, and documents across all connected storage."
    >
      <MediaGallery
        onOpenUpload={(folderId) => {
          setActiveFolderId(folderId || null);
          setUploadOpen(true);
        }}
        onOpenConnectStorage={() => setAddStorageOpen(true)}
      />

      <MediaUploadModal
        isOpen={uploadOpen}
        initialFolderId={activeFolderId}
        onClose={() => {
          setUploadOpen(false);
          setActiveFolderId(null);
        }}
        onUploadSuccess={(newItems) => {
          window.dispatchEvent(new CustomEvent('panda:media:uploaded', { detail: { newItems } }));
        }}
        onOpenConnectStorage={() => {
          setUploadOpen(false);
          setAddStorageOpen(true);
        }}
      />

      <AddStorageModal
        isOpen={addStorageOpen}
        onClose={() => setAddStorageOpen(false)}
        onStorageAdded={() => {
          window.dispatchEvent(new CustomEvent('panda:storage:updated'));
        }}
      />
    </AppLayout>
  );
}
