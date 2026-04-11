import 'dotenv/config';
import { writeFileSync, createWriteStream, statSync, renameSync, existsSync, readdirSync, unlinkSync } from 'fs';
import bot from './bot.js';
import { setupHandlers } from './handlers/index.js';
import * as sessionManager from './services/sessionManager.js';
import * as steamNotifications from './services/steamNotifications.js';
import * as db from './database.js';

// Скрываем предупреждение о punycode
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    return; // Игнорируем предупреждение о punycode
  }
  console.warn(warning.name, warning.message);
});

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
        const files = readdirSync('.');
        
        for (const file of files) {
          if (file.startsWith('bot.') && file.endsWith('.log') && file !== 'bot.log') {
            try {
              const fileStats = statSync(file);
              if (fileStats.mtimeMs < sevenDaysAgo) {
                unlinkSync(file);
                console.log(`🗑 Удален старый лог: ${file}`);
              }
            } catch (err) {
              // Игнорируем ошибки удаления
            }
          }
        }
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

// Запускаем сервис обновления токенов
import { startTokenRefreshService } from './services/tokenRefresh.js';
startTokenRefreshService();

// Запускаем систему управления логами
import { startLogManagement } from './services/logManager.js';
startLogManagement();

// Запускаем менеджер сессий (работает независимо от бота)
sessionManager.startSessionManager();

// Синхронизируем статусы в БД с реальным состоянием фарма
import * as farmManager from './services/farmManager.js';
const farmingAccounts = db.getFarmingAccounts();
const activeFarms = farmManager.getActiveFarms();
let syncedCount = 0;

for (const account of farmingAccounts) {
  if (!activeFarms.includes(account.id)) {
    // Аккаунт в БД помечен как фармящий, но реально не фармит
    db.updateAccountFarmingStatus(account.id, false);
    syncedCount++;
  }
}

if (syncedCount > 0) {
  console.log(`🔄 Синхронизировано статусов: ${syncedCount} аккаунтов`);
}

// Инициализируем настройки уведомлений только для новых пользователей (без настроек)
const allUsers = db.getAllUsers();
let initializedCount = 0;
for (const user of allUsers) {
  const existingSettings = db.getNotificationSettings(user.telegram_id);
  if (existingSettings.length === 0) {
    db.initNotifications(user.telegram_id);
    initializedCount++;
  }
}
if (initializedCount > 0) {
  console.log(`✅ Инициализированы настройки уведомлений для ${initializedCount} новых пользователей`);
}

// НЕ запускаем отдельное отслеживание - уведомления интегрированы в фарм-сессии
console.log(`✅ Уведомления интегрированы в фарм-сессии`);

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
    
    // Отправляем уведомление админу о запуске
    try {
      const { version } = await import('../package.json', { assert: { type: 'json' } });
      const adminIds = process.env.ADMIN_IDS?.split(',').map(id => id.trim()) || [];
      
      const startupMessage = `🚀 <b>Бот запущен</b>\n\n` +
        `📦 <b>Версия:</b> ${version}\n` +
        `⏰ <b>Время запуска:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' })}\n\n` +
        `✅ Все функции успешно запущены:\n` +
        `• База данных\n` +
        `• Менеджер сессий\n` +
        `• Система уведомлений\n` +
        `• Обновление токенов\n` +
        `• Управление логами\n` +
        `• Автообновление кеша\n\n` +
        `❌ Ошибок нет`;
      
      for (const adminId of adminIds) {
        if (adminId) {
          await bot.telegram.sendMessage(adminId, startupMessage, { parse_mode: 'HTML' }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('⚠️ Не удалось отправить уведомление админу:', err.message);
    }
  })
  .catch((err) => {
    console.error('❌ Ошибка запуска бота:', err.message);
    
    // Отправляем уведомление админу об ошибке
    try {
      const adminIds = process.env.ADMIN_IDS?.split(',').map(id => id.trim()) || [];
      const errorMessage = `❌ <b>Ошибка запуска бота</b>\n\n` +
        `<code>${err.message}</code>`;
      
      for (const adminId of adminIds) {
        if (adminId) {
          bot.telegram.sendMessage(adminId, errorMessage, { parse_mode: 'HTML' }).catch(() => {});
        }
      }
    } catch {}
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
