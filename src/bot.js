import { Telegraf, Input } from 'telegraf';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as db from './database.js';

const FORCE_PROXY = process.env.FORCE_PROXY === 'true';

let agent = undefined;
if (process.env.PROXY_URL) {
  try {
    agent = new HttpsProxyAgent(process.env.PROXY_URL);
    console.log('✅ HTTP прокси агент создан');
  } catch (err) {
    console.error('❌ Ошибка создания прокси агента:', err.message);
  }
}

let bot;

if (agent && FORCE_PROXY) {
  console.log('📡 Режим: Принудительно через прокси');
  bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: {
      agent,
      testEnv: false,
      apiRoot: 'https://api.telegram.org'
    },
    handlerTimeout: 90000 // 90 секунд таймаут
  });
} else if (agent) {
  console.log('📡 Режим: С прокси');
  bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: {
      agent,
      testEnv: false,
      apiRoot: 'https://api.telegram.org'
    },
    handlerTimeout: 90000
  });
} else {
  console.log('📡 Режим: Без прокси');
  bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: {
      testEnv: false,
      apiRoot: 'https://api.telegram.org'
    },
    handlerTimeout: 90000
  });
}

export default bot;

const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];
const BOT_USERNAME = process.env.BOT_USERNAME || 'SteamFarmWatchRobot';

bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  
  let user = db.getUser(ctx.from.id);
  if (!user) {
    db.createUser(ctx.from.id, ctx.from.username || 'Unknown');
    user = db.getUser(ctx.from.id);
    
    const refParam = ctx.startPayload;
    if (refParam && !isNaN(parseInt(refParam))) {
      const referrerId = parseInt(refParam);
      if (referrerId !== ctx.from.id) {
        db.setUserReferredBy(ctx.from.id, referrerId);
        db.addReferralDays(referrerId, 1);
      }
    }
  }
  
  ctx.dbUser = user;
  ctx.isAdmin = ADMIN_IDS.includes(ctx.from.id);
  return next();
});

bot.start(async (ctx) => {
  const isActive = db.isUserActive(ctx.from.id);
  const greeting = isActive 
    ? '👋 С возвращением!' 
    : '👋 Привет! 👋 Добро пожаловать в @SteamFarmWatchRobot — лучший инструмент для автоматического фарма часов в Steam.\n\n' +
      'Хочешь красивый профиль с тысячами часов в любимых играх, но не хочешь держать ПК включенным? Оставь это мне!\n\n' +
      'Что я умею:\n\n' +
      '⏱ Фарм 24/7: Работаю на удаленных серверах, твой компьютер может отдыхать.\n' +
      '🛡 Абсолютная безопасность: Мой алгоритм имитирует обычный запуск игр. Никаких рисков получить VAC-бан.\n' +
      '🎮 Мульти-запуск: Фармь часы в нескольких играх одновременно (до 30 игр на один аккаунт).\n' +
      '📱 Полный контроль: Запускай, останавливай и проверяй статус фарма прямо здесь, в Telegram.';
  
  const accounts = db.getSteamAccounts(ctx.from.id);
  const needsPinAccounts = accounts.filter(acc => {
    if (!acc.has_parental_control) return false;
    if (acc.family_pin) return false;
    const cachedLibrary = db.getCachedLibrary(acc.id);
    return cachedLibrary.length === 0;
  });
  
  let warningText = '';
  let pinButtons = [];
  
  if (needsPinAccounts.length > 0) {
    const names = needsPinAccounts.map(a => a.account_name).join(', ');
    warningText = needsPinAccounts.length === 1
      ? `\n⚠️ На аккаунте "${needsPinAccounts[0].account_name}" библиотека заблокирована родительским контролем Steam.\nДля фарма установите PIN!`
      : `\n⚠️ На аккаунтах библиотека заблокирована родительским контролем: ${names}\nДля фарма установите PIN!`;
    pinButtons = [[{ text: '🔐 Установить PIN', callback_data: `set_pin_${needsPinAccounts[0].id}` }]];
  }
  
  const msg = await ctx.reply(greeting + warningText, {
    reply_markup: {
      inline_keyboard: [
        ...pinButtons,
        [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }],
        [{ text: '👤 Профиль', callback_data: 'profile' }],
        [{ text: '🎁 Реферальная система', callback_data: 'referral' }]
      ]
    }
  });
  
  setTimeout(() => {
    try {
      ctx.telegram.deleteMessage(ctx.from.id, ctx.message.message_id);
    } catch {}
  }, 3000);
});

bot.command('menu', (ctx) => {
  const accounts = db.getSteamAccounts(ctx.from.id);
  const needsPinAccounts = accounts.filter(acc => {
    if (!acc.has_parental_control) return false;
    if (acc.family_pin) return false;
    const cachedLibrary = db.getCachedLibrary(acc.id);
    return cachedLibrary.length === 0;
  });
  
  let warningText = '';
  let pinButtons = [];
  
  if (needsPinAccounts.length > 0) {
    warningText = needsPinAccounts.length === 1
      ? `\n⚠️ На аккаунте "${needsPinAccounts[0].account_name}" библиотека заблокирована. Установите PIN!`
      : `\n⚠️ На аккаунтах библиотека заблокирована. Установите PIN!`;
    pinButtons = [[{ text: '🔐 Установить PIN', callback_data: `set_pin_${needsPinAccounts[0].id}` }]];
  }
  
  ctx.reply('📱 Главное меню:' + warningText, {
    reply_markup: {
      inline_keyboard: [
        ...pinButtons,
        [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }],
        [{ text: '👤 Профиль', callback_data: 'profile' }],
        [{ text: '🎁 Реферальная система', callback_data: 'referral' }]
      ]
    }
  });
});

bot.on('pre_checkout_query', async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    console.error('PreCheckoutQuery error:', err.message);
  }
});

bot.on('successful_payment', async (ctx) => {
  const payment = ctx.message?.successful_payment || ctx.editedMessage?.successful_payment;
  if (!payment) return;
  
  const telegramId = ctx.from.id;
  const invoicePayload = payment.invoice_payload;
  
  console.log(`💰 Successful Stars payment from ${telegramId}: ${invoicePayload}`);
  
  const tier = invoicePayload === 'premium_full' ? 2 : 1;
  const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
  
  db.setUserPremium(telegramId, tier, 30);
  
  await ctx.reply(`🎉 Premium активирован!\n━━━━━━━━━━━━━━━\n📦 ${tierLabel}\n💰 Оплачено: ${payment.total_amount} ⭐\n━━━━━━━━━━━━━━━\n✅ Premium на 30 дней!\n📝 Дни прибавлены к остатку.\n\nСпасибо за поддержку! ❤️`);
});

export { ADMIN_IDS, BOT_USERNAME };

process.once('SIGINT', async () => {
  try { await bot.stop(); } catch (e) { /* ignore */ }
  process.exit(0);
});
process.once('SIGTERM', async () => {
  try { await bot.stop(); } catch (e) { /* ignore */ }
  process.exit(0);
});
