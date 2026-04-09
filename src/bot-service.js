import 'dotenv/config';
import { writeFileSync } from 'fs';
import bot from './bot.js';
import { setupHandlers } from './handlers/index.js';
import * as db from './database.js';

// Скрываем предупреждение о punycode
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    return;
  }
  console.warn(warning.name, warning.message);
});

console.log('🤖 Запуск Bot Service...');

// Настраиваем логирование
const getTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const origLog = console.log;
const origError = console.error;

console.log = (...args) => origLog(`[${getTime()}]`, ...args);
console.error = (...args) => origError(`[${getTime()}]`, ...args);

console.log('🤖 Запуск Bot Service...');

// Инициализируем обработчики
console.log('📋 Инициализация обработчиков...');
try {
  setupHandlers();
  console.log('✅ Обработчики инициализированы');
} catch (err) {
  console.error('❌ Ошибка инициализации обработчиков:', err);
  process.exit(1);
}

// Сохраняем PID процесса
writeFileSync('./bot.pid', process.pid.toString());
console.log(`📝 PID бота: ${process.pid}`);

// Инициализируем настройки уведомлений для новых пользователей
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

// Запускаем бота
console.log('🚀 Запуск Telegram бота...');
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
    console.log('✅ Bot Service успешно запущен');
    
    // Отправляем уведомление админу о запуске
    try {
      const { version } = await import('../package.json', { assert: { type: 'json' } });
      const adminIds = process.env.ADMIN_IDS?.split(',').map(id => id.trim()) || [];
      
      const startupMessage = `🤖 <b>Bot Service запущен</b>\n\n` +
        `📦 <b>Версия:</b> ${version}\n` +
        `⏰ <b>Время запуска:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' })}\n\n` +
        `✅ Telegram бот готов к работе\n` +
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
    console.error('❌ Ошибка запуска Bot Service:', err.message);
  });

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Получен сигнал SIGINT, остановка Bot Service...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('🛑 Получен сигнал SIGTERM, остановка Bot Service...');
  bot.stop('SIGTERM');
});

bot.catch((err) => {
  console.error('❌ Ошибка в Bot Service:', err.message);
});
