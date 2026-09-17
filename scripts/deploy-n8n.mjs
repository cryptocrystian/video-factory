import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;
dotenv.config({ path: '.env.local' });

const root = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'config', 'factory-manifest.json'), 'utf8')
);

const required = ['N8N_BASE_URL', 'N8N_API_KEY', 'VIDEO_FACTORY_DB_URL'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

if ((process.env.FACTORY_NAMESPACE || manifest.factory.namespace) !== 'video_factory') {
  throw new Error('Factory namespace guardrail failed: expected video_factory');
}

const workflowPrefix = process.env.WORKFLOW_PREFIX || manifest.factory.workflowPrefix;
const baseUrl = process.env.N8N_BASE_URL.replace(/\/$/, '');

async function n8n(method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': process.env.N8N_API_KEY
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const raw = await response.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = raw; }
  }

  if (!response.ok) {
    throw new Error(`n8n ${method} ${pathname} failed (${response.status}): ${raw}`);
  }

  return data;
}

function sanitizeForApi(workflow) {
  // n8n 2.x treats fields such as meta as read-only on workflow create/update.
  // Keep deployment payloads intentionally minimal and portable.
  const allowed = ['name', 'nodes', 'connections', 'settings'];
  return Object.fromEntries(
    allowed.filter((key) => workflow[key] !== undefined).map((key) => [key, workflow[key]])
  );
}

async function listAllWorkflows() {
  const items = [];
  let cursor;
  do {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const result = await n8n('GET', `/api/v1/workflows?${params}`);
    items.push(...(result?.data || []));
    cursor = result?.nextCursor || undefined;
  } while (cursor);
  return items;
}

async function activateWorkflow(id) {
  return n8n('POST', `/api/v1/workflows/${id}/activate`);
}

async function syncRegistry(db, workflowKey, n8nWorkflow) {
  const result = await db.query(
    `update video_factory.workflow_definitions
       set external_workflow_id = $1,
           updated_at = now(),
           config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
             'managed_by', 'video-factory-repo',
             'manifest_key', $2,
             'n8n_name', $3,
             'last_deployed_at', now()
           )
     where workflow_name = $4`,
    [String(n8nWorkflow.id), workflowKey, n8nWorkflow.name, workflowKey]
  );

  if (result.rowCount !== 1) {
    throw new Error(`Workflow registry sync failed for ${workflowKey}; expected 1 row, updated ${result.rowCount}`);
  }
}

const workflowsInN8n = await listAllWorkflows();
const db = new Client({ connectionString: process.env.VIDEO_FACTORY_DB_URL });
await db.connect();

try {
  for (const entry of manifest.workflows.filter((w) => w.managed)) {
    if (!entry.name.startsWith(workflowPrefix)) {
      throw new Error(`Refusing to deploy non-Video Factory workflow: ${entry.name}`);
    }

    const filePath = path.join(root, entry.file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${entry.name}; source file does not exist yet.`);
      continue;
    }

    const source = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (source.name !== entry.name) {
      throw new Error(`Manifest/source name mismatch for ${entry.file}`);
    }

    const payload = sanitizeForApi(source);
    const existing = workflowsInN8n.find((w) => w.name === entry.name);
    let deployed;

    if (existing) {
      deployed = await n8n('PUT', `/api/v1/workflows/${existing.id}`, payload);
      console.log(`Updated ${entry.name} (${existing.id})`);
    } else {
      deployed = await n8n('POST', '/api/v1/workflows', payload);
      console.log(`Created ${entry.name} (${deployed.id})`);
      workflowsInN8n.push(deployed);
    }

    if (entry.activateOnDeploy) {
      deployed = await activateWorkflow(deployed.id);
      console.log(`Activated ${entry.name}`);
    }

    await syncRegistry(db, entry.key, deployed);
  }
} finally {
  await db.end();
}

console.log('Video Factory n8n deployment complete.');
