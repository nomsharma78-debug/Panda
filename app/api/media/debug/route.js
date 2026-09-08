import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { StorageManager } from "@/lib/storage/storage-manager";
import { listUserStorageConnections, getStorageConnectionInternal } from "@/lib/db/storage";
import { getMediaFileById } from "@/lib/db/media";
import { decryptData } from "@/lib/crypto/encryption";

// GET /api/media/debug?id=<mediaId>
export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const mediaId = searchParams.get("id");
  const token = request.headers.get("authorization")?.slice(7)?.trim();
  const userId = authData.user.id;

  const report = { userId, mediaId, steps: [] };

  try {
    const connections = await listUserStorageConnections(userId, token).catch(e => null);
    report.steps.push({
      step: "1_connections",
      count: connections?.length ?? 0,
      providers: connections?.map(c => ({ id: c.id, provider: c.provider, name: c.name })) ?? []
    });

    if (!connections?.length) {
      return NextResponse.json({ ...report, conclusion: "NO_STORAGE_CONNECTIONS" });
    }

    const storageRecord = await getStorageConnectionInternal(connections[0].id, userId, token).catch(e => null);
    let configInfo = {};
    if (storageRecord?.encrypted_config) {
      try {
        const cfg = decryptData(storageRecord.encrypted_config, null, true);
        configInfo = { provider: storageRecord.provider, hasEndpoint: !!cfg?.endpoint, endpoint: cfg?.endpoint, hasBucket: !!cfg?.bucket, bucket: cfg?.bucket, hasAccessKey: !!cfg?.accessKey };
      } catch (e) {
        configInfo = { error: "Decryption failed: " + e.message };
      }
    }
    report.steps.push({ step: "2_storage_config", ...configInfo });

    if (mediaId) {
      const media = await getMediaFileById(mediaId, userId, token).catch(e => ({ error: e.message }));
      report.steps.push({
        step: "3_media_record",
        found: !media?.error,
        objectKey: media?.object_key || media?.storage_object_key,
        encrypted: media?.encrypted,
        encryptionMetadata: media?.encryption_metadata,
        storageConnectionId: media?.storage_connection_id,
        mimeType: media?.mime_type,
        error: media?.error
      });

      if (!media?.error && storageRecord) {
        const key = media?.object_key || media?.storage_object_key;
        try {
          const provider = StorageManager.getProviderFromRecord(storageRecord);
          const dl = await provider.download(key);
          report.steps.push({ step: "4_download", ok: true, size: dl?.body?.length, contentType: dl?.contentType });
        } catch (e) {
          report.steps.push({ step: "4_download", ok: false, error: e.message, errorCode: e?.Code || e?.name });
        }
      }
    }

    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ ...report, fatalError: err.message }, { status: 500 });
  }
}
