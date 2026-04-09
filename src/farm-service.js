import 'dotenv/config';
import { writeFileSync, existsSync, statSync, renameSync, readdirSync, unlinkSync } from 'fs';
import * as sessionManager from './services/sessionManager.js';
import * as db from './database.js';

// Скрываем предупреждение о punycode
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    return;
  }
  console.warn(warning.name, warning.message);
});

console.log('⚙️ Запуск Farm Service...');

// ===== LOG ROTATION =====
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 МБ
const LOG_FILE = './farm.log';

function rotateLogIfNeeded() {
  try {
    if (existsSync(LOG_FILE)) {
      const stats = statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const timestamp = Date.now();
        renameSync(LOG_FILE, `./farm.${timestamp}.log`);
        console.log(`📋 Лог ротирован: farm.${timestamp}.log`);
        
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const files = readdirSync('.');
        
        for (const file of files) {
          if (file.startsWith('farm.') && file.endsWith('.log') && file !== 'farm.log') {
            try {
              const fileStats = statSync(file);
              if (fileStats.mtimeMs < sevenDaysAgo) {
                unlinkSync(file);
                console.log(`🗑 Удален старый лог: ${file}`);
              }
            } catch (err) {}
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Ошибка ротации логов:', err.message);
  }
}

rotateLogIfNeeded();
setInterval(rotateLogIfNeeded, 3600000);

// Настраиваем логирование
const getTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const origLog = console.log;
const origError = console.error;

console.log = (...args) => origLog(`[${getTime()}]`, ...args);
console.error = (...args) => origError(`[${getTime()}]`, ...args);

console.log('⚙️ Запуск Farm Service...');

// Сохраняем PID процесса
writeFileSync('./farm.pid', process.pid.toString());
console.log(`📝 PID Farm Service: ${process.pid}`);

// Запускаем автоматическую оптимизацию БД
db.startDatabaseMaintenance();

// Запускаем автообновление кеша игр
import { startCacheAutoUpdate } from './services/cacheManager.js';
startCacheAutoUpdate();

// Запускаем сервис уведомлений
import { startNotificationService } from './services/notificationService.js';
startNotificationService();

// Запускаем сервис обновления токенов
import { startTokenRefreshService } from './services/tokenRefresh.js';
startTokenRefreshService();

// Запускаем систему управления логами
import { startLogManagement } from './services/logManager.js';
startLogManagement();

// Запускаем менеджер сессий (основная логика фарма)
sessionManager.startSessionManager();

console.log('✅ Farm Service успешно запущен');
console.log('✅ Все фарм-сервисы активны');

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Получен сигнал SIGINT, остановка Farm Service...');
  sessionManager.stopSessionManager();
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 Получен сигнал SIGTERM, остановка Farm Service...');
  sessionManager.stopSessionManager();
  process.exit(0);
});

// Держим процесс активным
process.on('uncaughtException', (err) => {
  console.error('❌ Необработанная ошибка в Farm Service:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Необработанное отклонение промиса в Farm Service:', err);
});
