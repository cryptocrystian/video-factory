import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const root = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'config', 'factory-manifest.json'), 'utf8')
);

if (!process.env.N8N_BASE_URL || !process.env.N8N_API_KEY) {
  throw new Error('N8N_BASE_URL and N8N_API_KEY are required');
}

const baseUrl = process.env.N8N_BASE_URL.replace(/\/$/, '');
const prefix = process.env.WORKFLOW_PREFIX || manifest.factory.workflowPrefix;

async function n8n(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`n8n GET ${pathname} failed (${response.status}): ${raw}`);
  return raw ? JSON.parse(raw) : null;
}

async function listAll() {
  const items = [];
  let cursor;
  do {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const result = await n8n(`/api/v1/workflows?${params}`);
    items.push(...(result?.data || []));
    cursor = result?.nextCursor || undefined;
  } while (cursor);
  return items;
}

const all = await listAll();
const byName = new Map(all.map((workflow) => [workflow.name, workflow]));

for (const entry of manifest.workflows.filter((w) => w.managed)) {
  if (!entry.name.startsWith(prefix)) {
    throw new Error(`Manifest guardrail failed for ${entry.name}`);
  }

  const summary = byName.get(entry.name);
  if (!summary) {
    console.log(`Not present in n8n: ${entry.name}`);
    continue;
  }

  const workflow = await n8n(`/api/v1/workflows/${summary.id}`);
  const target = path.join(root, entry.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const portable = {
    name: workflow.name,
    nodes: workflow.nodes || [],
    connections: workflow.connections || {},
    settings: workflow.settings || {},
    staticData: workflow.staticData || null,
    pinData: workflow.pinData || {},
    meta: workflow.meta || {}
  };

  fs.writeFileSync(target, `${JSON.stringify(portable, null, 2)}\n`);
  console.log(`Exported ${entry.name} -> ${entry.file}`);
}
