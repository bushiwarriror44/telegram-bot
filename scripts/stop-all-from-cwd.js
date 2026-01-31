/**
 * Останавливает все процессы PM2, запущенные из текущей рабочей директории.
 * Выводит путь каждого бота (папка + скрипт).
 * Запуск: node scripts/stop-all-from-cwd.js (из корня проекта)
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

function normalizePath(p) {
  if (!p || typeof p !== 'string') return '';
  return resolve(p).toLowerCase().replace(/\\/g, '/');
}

// Текущая папка = откуда запущен скрипт (корень проекта при вызове из stop.bat)
const currentCwd = normalizePath(process.cwd());

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
  console.log('[INFO] Нет процессов PM2 или вывод пуст.');
  console.log('[INFO] Текущая папка:', process.cwd());
  process.exit(0);
}

const toStop = [];
for (let i = 0; i < list.length; i++) {
  const proc = list[i];
  const env = proc.pm2_env || proc;
  const pmCwd = env.pm_cwd || env.cwd || '';
  const procCwd = normalizePath(pmCwd);
  if (procCwd !== currentCwd) continue;

  const script = (env.args && env.args[0]) ? env.args[0] : (env.name || proc.name || '?');
  const id = proc.pm_id ?? env.pm_id ?? proc.pid ?? i;
  toStop.push({ id, cwd: pmCwd, script, name: env.name || proc.name || script });
}

if (toStop.length === 0) {
  console.log('[INFO] Нет процессов PM2, запущенных из текущей папки.');
  console.log('[INFO] Текущая папка:', process.cwd());
  process.exit(0);
}

console.log('[INFO] Найдено процессов из текущей папки:', toStop.length);
console.log('');

for (const { id, cwd, script, name } of toStop) {
  console.log('  ---');
  console.log('  ID:     ', id);
  console.log('  Папка:  ', cwd);
  console.log('  Скрипт: ', script);
  console.log('  Имя:    ', name);
  console.log('  ---');

  try {
    execSync(`pm2 stop ${id}`, { encoding: 'utf-8', stdio: 'inherit' });
    console.log(`  [OK] Процесс ${id} остановлен.`);
  } catch (e) {
    console.error(`  [ОШИБКА] Не удалось остановить процесс ${id}:`, e.message);
  }
  console.log('');
}

console.log('[INFO] Готово. Остановлено процессов:', toStop.length);
