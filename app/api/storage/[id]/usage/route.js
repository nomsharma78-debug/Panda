import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getStorageConnectionInternal, updateStorageUsage } from '@/lib/db/storage';
import { StorageManager } from '@/lib/storage/storage-manager';

export async function POST(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const storageRecord = await getStorageConnectionInternal(id, authData.user.id);
    if (!storageRecord) {
      return NextResponse.json({ error: 'Storage connection not found' }, { status: 404 });
    }

    const provider = StorageManager.getProviderFromRecord(storageRecord);
    const usage = await provider.getUsage();

    if (usage) {
      await updateStorageUsage(authData.user.id, id, usage);
      return NextResponse.json({ usage });
    }

    return NextResponse.json({
      usage: null,
      message: 'Usage metrics unavailable for this provider',
    });
  } catch (err) {
    console.error('Refresh storage usage error:', err);
    return NextResponse.json({ error: 'Failed to refresh storage usage' }, { status: 500 });
  }
}
