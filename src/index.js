import 'dotenv/config';
import { writeFileSync } from 'fs';
import bot from './bot.js';
import './handlers/index.js';
import * as sessionManager from './services/sessionManager.js';

console.log('🚀 Запуск бота...');

// Сохраняем PID процесса для корректной остановки
writeFileSync('./bot.pid', process.pid.toString());
console.log(`📝 PID бота: ${process.pid}`);

// Запускаем менеджер сессий (работает независимо от бота)
sessionManager.startSessionManager();

// Пытаемся остановить старую сессию перед запуском
try {
  await bot.stop();
  console.log('ℹ️ Старая сессия остановлена');
} catch (err) {}

bot.launch({
  dropPendingUpdates: true,
  allowedUpdates: ['message', 'callback_query']
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
