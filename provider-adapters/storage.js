// Durable storage abstraction for asset archival.
//
// A backend maps a Video Factory asset to one deterministic object and knows how
// to build the upload request and read the response. The runtime never hard-wires
// a single vendor: the active backend comes from config/factory-manifest.json
// (storage.backend), inlined into the workflow at build time.
//
// Credentials are never part of these objects; the HTTP node carries an n8n
// credential (VIDEO_FACTORY_SUPABASE_STORAGE for the Supabase backend).

const VF_STORAGE_CONTRACT_VERSION = '1.0';

const VF_EXT_BY_MIME = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

function vfObjectExtension(asset) {
  const fromUri = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(String(asset.uri || '').split('?')[0]);
  if (fromUri) return fromUri[1].toLowerCase();
  return VF_EXT_BY_MIME[asset.mime_type] || 'bin';
}

// Deterministic: the same asset always maps to the same object, so a retry
// overwrites in place instead of creating a second archive object.
function vfObjectKey(asset, template) {
  const ext = vfObjectExtension(asset);
  return String(template || 'episodes/{episode_id}/assets/{asset_id}.{ext}')
    .replace('{episode_id}', asset.episode_id || 'unassigned')
    .replace('{asset_id}', asset.id)
    .replace('{asset_type}', String(asset.asset_type || 'other').toLowerCase())
    .replace('{ext}', ext);
}

const VF_STORAGE_BACKENDS = {
  // Supabase Storage: existing Video Factory infrastructure, no new paid service.
  supabase_storage: {
    buildUpload(asset, key, cfg) {
      const base = String(cfg.base_url || '').replace(/\/$/, '');
      if (!base) return { error: 'STORAGE_BASE_URL_NOT_CONFIGURED' };
      if (!cfg.bucket) return { error: 'STORAGE_BUCKET_NOT_CONFIGURED' };
      return {
        method: 'POST',
        url: `${base}/storage/v1/object/${cfg.bucket}/${key}`,
        headers: {
          // upsert keeps archival idempotent for a retried asset
          'x-upsert': 'true',
          'cache-control': String(cfg.cache_control || 'max-age=31536000'),
          'content-type': asset.mime_type || 'application/octet-stream',
        },
      };
    },
    normalizeUpload(http, asset, key, cfg) {
      if (!http.transport_ok) return { ok: false, retryable: true, error: 'storage upload transport error: ' + http.transport_error };
      if (http.status_code === 401 || http.status_code === 403) return { ok: false, retryable: true, error: 'storage upload unauthorized (HTTP ' + http.status_code + ')' };
      if (http.status_code >= 500 || http.status_code === 429) return { ok: false, retryable: true, error: 'storage upload HTTP ' + http.status_code };
      if (http.status_code < 200 || http.status_code >= 300) {
        const b = http.body || {};
        return { ok: false, retryable: false, error: 'storage upload HTTP ' + http.status_code + ': ' + vfTruncate(typeof b === 'string' ? b : (b.message || b.error || JSON.stringify(b)), 300) };
      }
      const base = String(cfg.base_url || '').replace(/\/$/, '');
      const uri = cfg.public_read
        ? `${base}/storage/v1/object/public/${cfg.bucket}/${key}`
        : `${base}/storage/v1/object/${cfg.bucket}/${key}`;
      const body = http.body && typeof http.body === 'object' ? http.body : {};
      const h = http.headers || {};
      const etag = h.etag || h.ETag || body.Etag || body.etag || null;
      return {
        ok: true,
        archive_uri: uri,
        archive_object_key: key,
        archive_storage_provider: 'supabase_storage',
        // Supabase returns an ETag for the stored object; it is the only integrity
        // value available without hashing the payload inside the workflow sandbox.
        checksum: etag ? String(etag).replace(/"/g, '') : null,
        checksum_algorithm: etag ? 'etag' : null,
      };
    },
  },
};

function vfStorageBackend(cfg) {
  return VF_STORAGE_BACKENDS[(cfg && cfg.backend) || ''] || null;
}

// "Claim Asset For Archive" -> archive request, or a terminal reason not to archive.
// defaults come from config/factory-manifest.json at build time; the database row
// (providers.supabase_storage) supplies base_url/bucket and is authoritative.
function vfStepBuildArchive(row, workerId, defaults) {
  if (!row || !row.asset || !row.asset.id) return { outcome: 'NO_ASSET' };
  const asset = row.asset;
  const cfg = Object.assign({}, defaults || {}, row.storage_config || {});
  const base = { worker_id: workerId, asset_id: asset.id, provider_uri: asset.uri, mime_type: asset.mime_type || null };

  const backend = vfStorageBackend(cfg);
  if (!backend) {
    return Object.assign(base, { outcome: 'FAILED', fail_payload: { asset_id: asset.id, worker_id: workerId, stage: 'configure', error: 'STORAGE_BACKEND_NOT_CONFIGURED: ' + ((cfg && cfg.backend) || 'none') } });
  }
  if (!asset.uri || !/^https:\/\//i.test(asset.uri)) {
    return Object.assign(base, { outcome: 'FAILED', fail_payload: { asset_id: asset.id, worker_id: workerId, stage: 'configure', error: 'ASSET_URI_NOT_ARCHIVABLE' } });
  }
  if (asset.archive_uri) {
    return Object.assign(base, { outcome: 'ALREADY_ARCHIVED' });
  }

  const key = vfObjectKey(asset, cfg.path_template);
  const upload = backend.buildUpload(asset, key, cfg);
  if (upload.error) {
    return Object.assign(base, { outcome: 'FAILED', fail_payload: { asset_id: asset.id, worker_id: workerId, stage: 'configure', error: upload.error } });
  }
  return Object.assign(base, {
    outcome: 'ARCHIVE',
    contract_version: VF_STORAGE_CONTRACT_VERSION,
    storage_config: cfg,
    object_key: key,
    download_request: { method: 'GET', url: asset.uri },
    upload_request: upload,
  });
}

function vfStepAfterDownload(plan, httpItem, binaryMeta) {
  const http = vfHttpResult(httpItem);
  if (!http.transport_ok) {
    return Object.assign({}, plan, { outcome: 'FAILED', fail_payload: { asset_id: plan.asset_id, worker_id: plan.worker_id, stage: 'download', error: 'provider download transport error: ' + http.transport_error } });
  }
  if (http.status_code < 200 || http.status_code >= 300) {
    return Object.assign({}, plan, { outcome: 'FAILED', fail_payload: { asset_id: plan.asset_id, worker_id: plan.worker_id, stage: 'download', error: 'provider download HTTP ' + http.status_code } });
  }
  const size = binaryMeta && (binaryMeta.fileSize != null ? Number(binaryMeta.fileSize) : null);
  return Object.assign({}, plan, { outcome: 'UPLOAD', downloaded: { size_bytes: Number.isFinite(size) ? size : null, mime_type: (binaryMeta && binaryMeta.mimeType) || plan.mime_type } });
}

function vfStepAfterUpload(plan, httpItem, cfg) {
  const http = vfHttpResult(httpItem);
  const backend = vfStorageBackend(cfg);
  const res = backend.normalizeUpload(http, { id: plan.asset_id, mime_type: plan.mime_type }, plan.object_key, cfg);
  if (!res.ok) {
    return Object.assign({}, plan, { outcome: 'FAILED', fail_payload: { asset_id: plan.asset_id, worker_id: plan.worker_id, stage: 'upload', error: res.error } });
  }
  return Object.assign({}, plan, {
    outcome: 'ARCHIVED',
    persist_payload: {
      asset_id: plan.asset_id,
      worker_id: plan.worker_id,
      archive_uri: res.archive_uri,
      archive_object_key: res.archive_object_key,
      archive_storage_provider: res.archive_storage_provider,
      archive_checksum: res.checksum,
      archive_checksum_algorithm: res.checksum_algorithm,
      archive_size_bytes: (plan.downloaded && plan.downloaded.size_bytes) || null,
    },
  });
}
