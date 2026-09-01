'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { SettingsManager } from '@/components/settings/SettingsManager';

function SettingsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'account';

  return <SettingsManager initialTab={initialTab} />;
}

export default function SettingsPage() {
  return (
    <AppLayout
      title="Vault Settings"
      subtitle="Security settings, active sessions, connected databases, and audit logs."
    >
      <Suspense fallback={<div className="h-64 rounded-2xl bg-slate-900 animate-pulse" />}>
        <SettingsContent />
      </Suspense>
    </AppLayout>
  );
}
