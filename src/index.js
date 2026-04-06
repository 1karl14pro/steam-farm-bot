import 'dotenv/config';
import { writeFileSync, createWriteStream, statSync, renameSync, existsSync } from 'fs';
import bot from './bot.js';
import { setupHandlers } from './handlers/index.js';
import * as sessionManager from './services/sessionManager.js';
import * as db from './database.js';

console.log('🚀 Запуск бота...');
setupHandlers();

// ===== LOG ROTATION =====
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 МБ
const LOG_FILE = './bot.log';

function rotateLogIfNeeded() {
  try {
    if (existsSync(LOG_FILE)) {
      const stats = statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const timestamp = Date.now();
        renameSync(LOG_FILE, `./bot.${timestamp}.log`);
        console.log(`📋 Лог ротирован: bot.${timestamp}.log`);
        
        // Удаляем старые логи (старше 7 дней)
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        // Здесь можно добавить удаление старых файлов
      }
    }
  } catch (err) {
    console.error('❌ Ошибка ротации логов:', err.message);
  }
}

// Проверяем размер лога при старте
rotateLogIfNeeded();

// Проверяем размер лога каждый час
setInterval(rotateLogIfNeeded, 3600000);

// Добавляем timestamp к логам
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

const getTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// В production режиме уменьшаем логирование
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  console.log = (...args) => {
    // Логируем только важные сообщения (с эмодзи статуса)
    const msg = args.join(' ');
    if (msg.includes('✅') || msg.includes('❌') || msg.includes('⚠️') || msg.includes('🚀')) {
      origLog(`[${getTime()}]`, ...args);
    }
  };
} else {
  console.log = (...args) => origLog(`[${getTime()}]`, ...args);
}

console.error = (...args) => origError(`[${getTime()}]`, ...args);
console.warn = (...args) => origWarn(`[${getTime()}]`, ...args);

console.log('🚀 Запуск бота...');

// Сохраняем PID процесса для корректной остановки
writeFileSync('./bot.pid', process.pid.toString());
console.log(`📝 PID бота: ${process.pid}`);

// Запускаем автоматическую оптимизацию БД
db.startDatabaseMaintenance();

// Запускаем автообновление кеша игр
import { startCacheAutoUpdate } from './services/cacheManager.js';
startCacheAutoUpdate();

// Запускаем сервис уведомлений
import { startNotificationService } from './services/notificationService.js';
startNotificationService();

// Запускаем менеджер сессий (работает независимо от бота)
sessionManager.startSessionManager();

// Пытаемся остановить старую сессию перед запуском
try {
  await bot.stop();
  console.log('ℹ️ Старая сессия остановлена');
} catch (err) {}

bot.launch({
  dropPendingUpdates: true,
  allowedUpdates: ['message', 'callback_query'],
  polling: {
    timeout: 30,
    limit: 100,
    allowed_updates: ['message', 'callback_query']
  }
})
  .then(async () => {
    console.log('✅ Бот успешно запущен');
    console.log('🤖 Бот готов к работе!');
  })
  .catch((err) => {
    console.error('❌ Ошибка запуска бота:', err.message);
  });

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Получен сигнал SIGINT, остановка...');
  sessionManager.stopSessionManager();
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('🛑 Получен сигнал SIGTERM, остановка...');
  sessionManager.stopSessionManager();
  bot.stop('SIGTERM');
});

bot.catch((err) => {
  console.error('❌ Ошибка в боте:', err.message);
});
