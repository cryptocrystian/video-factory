import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const manifestPath = path.join(root, 'config', 'factory-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

let failed = false;

for (const wf of manifest.workflows) {
  const filePath = path.join(root, wf.file);

  if (!fs.existsSync(filePath)) {
    console.error(`Missing workflow file: ${wf.file}`);
    failed = true;
    continue;
  }

  const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (workflow.name !== wf.name) {
    console.error(`Workflow name mismatch in ${wf.file}: expected '${wf.name}', got '${workflow.name}'`);
    failed = true;
  }

  if (!workflow.name?.startsWith(manifest.factory.workflowPrefix)) {
    console.error(`Workflow violates prefix guardrail: ${workflow.name}`);
    failed = true;
  }

  if (!Array.isArray(workflow.nodes)) {
    console.error(`Workflow has no nodes array: ${wf.file}`);
    failed = true;
  }

  if (!workflow.connections || typeof workflow.connections !== 'object') {
    console.error(`Workflow has no connections object: ${wf.file}`);
    failed = true;
  }

  const serialized = JSON.stringify(workflow);
  const forbidden = [
    /gnpjcfsizzozxcolbcyz\.supabase\.co/i,
    /service[_-]?role/i,
    /api[_-]?key/i,
    /password/i,
    /secret/i
  ];

  for (const pattern of forbidden) {
    if (pattern.test(serialized)) {
      console.error(`Possible embedded credential or environment-specific secret in ${wf.file}: ${pattern}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Validated ${manifest.workflows.length} managed Video Factory workflows.`);
