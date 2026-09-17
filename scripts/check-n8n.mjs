import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

if (!process.env.N8N_BASE_URL || !process.env.N8N_API_KEY) {
  throw new Error('N8N_BASE_URL and N8N_API_KEY are required');
}

const baseUrl = process.env.N8N_BASE_URL.replace(/\/$/, '');
const response = await fetch(`${baseUrl}/api/v1/workflows?limit=1`, {
  headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`n8n API connectivity failed (${response.status}): ${body}`);
}

const parsed = body ? JSON.parse(body) : {};
console.log(`n8n API connectivity OK. Returned ${parsed?.data?.length ?? 0} workflow record(s).`);
