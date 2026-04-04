import 'dotenv/config';
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);

console.log('🧹 Очистка старых сессий бота...');

try {
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  console.log('✅ Webhook удален');
} catch (err) {
  console.log('ℹ️ Webhook не был установлен');
}

console.log('✅ Очистка завершена. Можно запускать бота.');
process.exit(0);
