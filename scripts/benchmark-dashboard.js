import { getVaultStats } from '../lib/db/vault.js';
import { getMediaStats, getRecentMedia } from '../lib/db/media.js';
import { getCombinedStorageMetrics, listUserStorageConnections } from '../lib/db/storage.js';
import { listUserAuditLogs } from '../lib/db/audit.js';
import { StorageManager } from '../lib/storage/storage-manager.js';
import { getSupabaseAdminClient, getSupabaseVaultAdminClient } from '../lib/auth/supabase.js';
import { queryVault, query } from '../lib/db/index.js';

async function timeOperation(name, fn) {
  const start = performance.now();
  let result = null;
  let error = null;
  try {
    result = await fn();
  } catch (err) {
    error = err.message;
  }
  const duration = (performance.now() - start).toFixed(2);
  return { name, duration: `${duration}ms`, error, result };
}

async function runBenchmark() {
  console.log('====================================================');
  console.log('  PANDA DASHBOARD PERFORMANCE & LATENCY BENCHMARK   ');
  console.log('====================================================');

  const userId = 'test-user-' + Date.now();

  console.log('\n[1] Direct Database Engine Latency:');
  const tPgVault = await timeOperation('PostgreSQL Vault Query (SELECT 1)', () => queryVault('SELECT 1'));
  console.log(`  - ${tPgVault.name}: ${tPgVault.duration} (Error: ${tPgVault.error || 'none'})`);

  const tPgMain = await timeOperation('PostgreSQL Main Query (SELECT 1)', () => query('SELECT 1'));
  console.log(`  - ${tPgMain.name}: ${tPgMain.duration} (Error: ${tPgMain.error || 'none'})`);

  console.log('\n[2] Remote Supabase Cloud REST Latency:');
  const sbClient = getSupabaseAdminClient();
  if (sbClient) {
    const tSbPing = await timeOperation('Supabase REST Ping (users count)', () =>
      sbClient.from('users').select('id', { count: 'exact', head: true })
    );
    console.log(`  - ${tSbPing.name}: ${tSbPing.duration} (Error: ${tSbPing.error || 'none'})`);
  } else {
    console.log('  - Supabase client not configured.');
  }

  const sbVaultClient = getSupabaseVaultAdminClient();
  if (sbVaultClient) {
    const tSbVaultPing = await timeOperation('Supabase Vault Ping (vault_items select)', () =>
      sbVaultClient.from('vault_items').select('id', { count: 'exact', head: true })
    );
    console.log(`  - ${tSbVaultPing.name}: ${tSbVaultPing.duration} (Error: ${tSbVaultPing.error || 'none'})`);
  }

  console.log('\n[3] Dashboard Parallel Sub-Operations:');
  const results = await Promise.all([
    timeOperation('getVaultStats', () => getVaultStats(userId)),
    timeOperation('getMediaStats', () => getMediaStats(userId)),
    timeOperation('getCombinedStorageMetrics', () => getCombinedStorageMetrics(userId)),
    timeOperation('listUserStorageConnections', () => listUserStorageConnections(userId)),
    timeOperation('getRecentMedia', () => getRecentMedia(userId, 6)),
    timeOperation('listUserAuditLogs', () => listUserAuditLogs(userId, 8)),
  ]);

  results.forEach((r) => {
    console.log(`  - ${r.name.padEnd(28)}: ${r.duration.padStart(8)} (Error: ${r.error || 'none'})`);
  });

  const totalParallelStart = performance.now();
  await Promise.allSettled([
    getVaultStats(userId),
    getMediaStats(userId),
    getCombinedStorageMetrics(userId),
    listUserStorageConnections(userId),
    getRecentMedia(userId, 6),
    listUserAuditLogs(userId, 8),
  ]);
  const totalParallelDuration = (performance.now() - totalParallelStart).toFixed(2);
  console.log(`\n  >>> Total Parallel Dashboard Execution Time: ${totalParallelDuration}ms`);

  console.log('\n[4] Cloud Storage (S3 / R2 / B2) Auto-Sync Latency:');
  const tSync = await timeOperation('StorageManager.syncStorageMedia', () => StorageManager.syncStorageMedia(userId));
  console.log(`  - ${tSync.name}: ${tSync.duration} (Error: ${tSync.error || 'none'})`);

  console.log('====================================================\n');
  process.exit(0);
}

runBenchmark();
