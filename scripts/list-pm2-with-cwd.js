/**
 * Outputs PM2 process list with cwd and script path (ASCII only for CMD).
 * Run: node scripts/list-pm2-with-cwd.js
 */

import { execSync } from 'child_process';

let raw;
try {
  raw = execSync('pm2 jlist', { encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024 });
} catch (e) {
  console.error('[ERROR] pm2 jlist failed:', e.message);
  process.exit(1);
}

let list;
try {
  const trimmed = raw.trim();
  const parsed = JSON.parse(trimmed);
  list = Array.isArray(parsed) ? parsed : (parsed.processes || parsed.data || []);
} catch (e) {
  console.error('[ERROR] Failed to parse pm2 jlist output.');
  process.exit(1);
}

if (!Array.isArray(list) || list.length === 0) {
  console.log('[INFO] No PM2 processes.');
  process.exit(0);
}

console.log('');
console.log('--- Process cwd and script ---');
console.log('');

for (let i = 0; i < list.length; i++) {
  const proc = list[i];
  const env = proc.pm2_env || proc;
  const id = proc.pm_id ?? env.pm_id ?? proc.pid ?? i;
  const name = env.name || proc.name || '?';
  const status = env.status || proc.pm2_env?.status || '?';
  const cwd = env.pm_cwd || env.cwd || '(not set)';
  const script = (env.args && env.args[0]) ? env.args[0] : '(not set)';

  console.log('  id ' + id + ' | name: ' + name + ' | status: ' + status);
  console.log('       cwd:    ' + cwd);
  console.log('       script: ' + script);
  console.log('');
}

console.log('---');
