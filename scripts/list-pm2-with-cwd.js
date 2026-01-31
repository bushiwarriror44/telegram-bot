/**
 * Выводит список процессов PM2 с путями: папка (cwd) и скрипт для каждого.
 * Запуск: node scripts/list-pm2-with-cwd.js
 */

import { execSync } from 'child_process';

let raw;
try {
  raw = execSync('pm2 jlist', { encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024 });
} catch (e) {
  console.error('[ОШИБКА] Не удалось выполнить pm2 jlist:', e.message);
  process.exit(1);
}

let list;
try {
  const trimmed = raw.trim();
  const parsed = JSON.parse(trimmed);
  list = Array.isArray(parsed) ? parsed : (parsed.processes || parsed.data || []);
} catch (e) {
  console.error('[ОШИБКА] Не удалось разобрать вывод pm2 jlist.');
  process.exit(1);
}

if (!Array.isArray(list) || list.length === 0) {
  console.log('[INFO] Нет процессов PM2.');
  process.exit(0);
}

console.log('');
console.log('--- Место запуска каждого процесса (папка и скрипт) ---');
console.log('');

for (let i = 0; i < list.length; i++) {
  const proc = list[i];
  const env = proc.pm2_env || proc;
  const id = proc.pm_id ?? env.pm_id ?? proc.pid ?? i;
  const name = env.name || proc.name || '?';
  const status = env.status || proc.pm2_env?.status || '?';
  const cwd = env.pm_cwd || env.cwd || '(не указано)';
  const script = (env.args && env.args[0]) ? env.args[0] : '(не указано)';

  console.log(`  id ${id} | name: ${name} | status: ${status}`);
  console.log(`       папка:  ${cwd}`);
  console.log(`       скрипт: ${script}`);
  console.log('');
}

console.log('---');
