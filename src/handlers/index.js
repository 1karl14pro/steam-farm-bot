import bot, { ADMIN_IDS } from '../bot.js';
import * as db from '../database.js';
import * as formatter from '../services/formatter.js';
import * as steamAuth from '../services/steamAuth.js';
import * as farmManager from '../services/farmManager.js';
import { createCryptoInvoice } from '../services/cryptoPayment.js';
import * as steamLibrary from '../services/steamLibrary.js';
import { POPULAR_GAMES, MAX_GAMES_PER_ACCOUNT } from '../constants.js';

const userStates = new Map();

bot.action('profile', async (ctx) => {
  const accounts = db.getSteamAccounts(ctx.from.id);
  const profileText = formatter.formatUserProfileFull(ctx.dbUser, accounts);
  
  const buttons = [];
  if (ctx.dbUser?.is_premium !== 1) {
    buttons.push([{ text: '💳 Купить Premium', callback_data: 'buy_premium' }]);
  }
  buttons.push([{ text: '❓ Помощь', callback_data: 'help' }]);
  buttons.push([{ text: '🔙 Главное меню', callback_data: 'main_menu' }]);
  
  await ctx.editMessageText(profileText, {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
});

bot.action('buy_premium', async (ctx) => {
  const info = db.getUserSubscriptionInfo(ctx.from.id);
  
  let subInfo = '';
  if (info.isPremium) {
    const daysLeft = Math.ceil((info.expiresAt - Math.floor(Date.now() / 1000)) / 86400);
    subInfo = `━━━━━━━━━━━━━━━\n📌 Текущая: ${info.tier === 2 ? '⭐ Полный' : '📦 Базовый'} (${daysLeft}д.)\n📝 Дни при покупке суммируются!\n`;
  } else if (info.isTrial) {
    const daysLeft = Math.ceil((info.trialEndsAt - Math.floor(Date.now() / 1000)) / 86400);
    subInfo = `━━━━━━━━━━━━━━━\n📌 Триал истекает через ${daysLeft}д.\n📝 Дни при покупке суммируются!\n`;
  }
  
  const text = `💳 Выберите тариф Premium\n` +
    subInfo +
    `━━━━━━━━━━━━━━━\n` +
    `📦 Базовый\n` +
    `   • До 30 аккаунтов\n` +
    `   • Срок: 30 дней\n\n` +
    `⭐ Полный\n` +
    `   • Безлимит аккаунтов\n` +
    `   • Срок: 30 дней\n\n` +
    `📌 Дни при покупке прибавляются к остатку!`;
  
  await ctx.editMessageText(text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Базовый', callback_data: 'pay_select_1' }],
        [{ text: '⭐ Полный', callback_data: 'pay_select_2' }],
        [{ text: '🔙 К профилю', callback_data: 'profile' }]
      ]
    }
  });
});

bot.action(/^pay_select_(\d)$/, async (ctx) => {
  const tier = parseInt(ctx.match[1]);
  const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
  
  userStates.set(ctx.from.id, { action: 'await_payment_method', tier });
  
  const text = `${tierLabel}\n━━━━━━━━━━━━━━━\nВыберите способ оплаты:\n\n` +
    `⭐ Звёзды — моментальная активация\n\n` +
    `🔗 Криптобот — USDT (автоактивация)\n\n` +
    `💳 Перевод — оплата удобным способом\n   (карта, крипта, и т.д.)`;
  
  await ctx.editMessageText(text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⭐ Звёзды', callback_data: `pay_stars_${tier}` }],
        [{ text: '🔗 Криптобот', callback_data: `pay_crypto_${tier}` }],
        [{ text: '💳 Перевод', callback_data: `pay_manual_${tier}` }],
        [{ text: '🔙 Назад', callback_data: 'buy_premium' }]
      ]
    }
  });
});

bot.action(/^pay_stars_(\d)$/, async (ctx) => {
  const tier = parseInt(ctx.match[1]);
  const payload = tier === 2 ? 'premium_full' : 'premium_basic';
  const title = tier === 2 ? '⭐ Premium Полный — 30 дней' : '📦 Premium Базовый — 30 дней';
  const amount = tier === 2 ? 150 : 75;
  
  try {
    await ctx.replyWithInvoice({
      title,
      description: 'Безлимит игр • Безлимит аккаунтов • Срок: 30 дней',
      payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: title, amount }]
    });
  } catch (err) {
    console.error('Stars invoice error:', err.message);
    await ctx.answerCbQuery('❌ Ошибка. Попробуйте позже.', { show_alert: true });
  }
});

bot.action(/^pay_crypto_(\d)$/, async (ctx) => {
  const tier = parseInt(ctx.match[1]);
  const price = tier === 2 ? '200₽' : '100₽';
  const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
  
  try {
    const invoice = await createCryptoInvoice(tier, ctx.from.id);
    
    userStates.set(ctx.from.id, { action: 'await_crypto_payment', tier, invoiceId: invoice.invoice_id });
    
    const text = `🔗 Криптобот\n━━━━━━━━━━━━━━━\nТариф: ${tierLabel} — ${price}\n━━━━━━━━━━━━━━━\n\n` +
      `💰 К оплате: ${invoice.amount} USDT\n` +
      `📋 Нажмите кнопку ниже для оплаты\n` +
      `⏱ Счёт действителен 30 минут\n\n` +
      `✅ После оплаты Premium активируется\n   автоматически!`;
    
    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Оплатить USDT', url: invoice.bot_invoice_url }],
          [{ text: '⏳ Проверить оплату', callback_data: `crypto_check_${invoice.invoice_id}` }],
          [{ text: '🔙 Назад', callback_data: `pay_select_${tier}` }]
        ]
      }
    });
  } catch (err) {
    console.error('Crypto invoice error:', err.message);
    await ctx.answerCbQuery('❌ Ошибка. Попробуйте позже.', { show_alert: true });
  }
});

bot.action(/^crypto_check_(.+)$/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const state = userStates.get(ctx.from.id);
  
  try {
    const resp = await fetch(`https://pay.crypt.bot/api/getInvoices?invoice_ids=${invoiceId}`, {
      headers: { 'Crypto-Pay-API-Token': process.env.CRYPTO_API_TOKEN }
    });
    const data = await resp.json();
    
    if (!data.ok || !data.result.length) {
      await ctx.answerCbQuery('❌ Счёт не найден', { show_alert: true });
      return;
    }
    
    const invoice = data.result[0];
    
    if (invoice.status === 'paid') {
      const payload = JSON.parse(invoice.payload || '{}');
      const tier = payload.tier || state?.tier || 1;
      const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
      
      db.setUserPremium(ctx.from.id, tier, 30);
      userStates.delete(ctx.from.id);
      
      await ctx.editMessageText(`🎉 Платёж получен!\n━━━━━━━━━━━━━━━\n💰 Оплачено: ${invoice.amount} ${invoice.asset}\n📦 Premium: ${tierLabel}\n━━━━━━━━━━━━━━━\n✅ Premium активирован на 30 дней!\n📝 Дни прибавлены к остатку.\n\nСпасибо! ❤️`);
    } else if (invoice.status === 'active') {
      await ctx.answerCbQuery('⏳ Оплата не получена. Попробуйте позже.', { show_alert: true });
    } else {
      await ctx.answerCbQuery('❌ Счёт истёк. Создайте новый.', { show_alert: true });
    }
  } catch (err) {
    console.error('Crypto check error:', err.message);
    await ctx.answerCbQuery('❌ Ошибка проверки', { show_alert: true });
  }
});

bot.action(/^pay_manual_(\d)$/, async (ctx) => {
  const tier = parseInt(ctx.match[1]);
  const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
  
  userStates.set(ctx.from.id, { action: 'await_proof', tier, messageId: ctx.callbackQuery.message.message_id });
  
  const text = `💳 Перевод\n━━━━━━━━━━━━━━━\n📦 Тариф: ${tierLabel}\n━━━━━━━━━━━━━━━\n\n` +
    `📋 Реквизиты для оплаты:\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💳 Сбербанк\n` +
    `📱 +79505343303\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `📋 Прикрепите скриншот оплаты или чек\n\n` +
    `⏱ Проверка: до 24 часов`;
  
  await ctx.editMessageText(text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Назад', callback_data: `pay_select_${tier}` }]
      ]
    }
  });
});

const handleProof = async (ctx, fileId, isPhoto) => {
  const state = userStates.get(ctx.from.id);
  if (!state || state.action !== 'await_proof') return;
  
  const tier = state.tier;
  const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
  const price = tier === 2 ? '200₽' : '100₽';
  
  db.createPendingPayment(ctx.from.id, tier, 'transfer', price, fileId, null);
  
  const text = `✅ Чек отправлен!\n━━━━━━━━━━━━━━━\n📦 Тариф: ${tierLabel}\n💰 Сумма: ${price}\n━━━━━━━━━━━━━━━\n⏱ Ожидание проверки...\n📩 Мы пришлём уведомление.`;
  
  userStates.delete(ctx.from.id);
  
  try {
    await ctx.telegram.editMessageText(
      ctx.from.id,
      state.messageId,
      null,
      text,
      { reply_markup: { inline_keyboard: [] } }
    );
  } catch {}
  
  const user = db.getUser(ctx.from.id);
  for (const adminId of ADMIN_IDS) {
    try {
      const sendFn = isPhoto ? 'sendPhoto' : 'sendDocument';
      await ctx.telegram[sendFn](adminId, fileId, {
        caption: `💳 Новый платёж!\n━━━━━━━━━━━━━━━\n👤 ${user?.username || ctx.from.first_name} [${ctx.from.id}]\n📦 Тариф: ${tierLabel}\n💰 Сумма: ${price}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Подтвердить', callback_data: `apay_a_${ctx.from.id}` }, { text: '❌ Отклонить', callback_data: `apay_r_${ctx.from.id}` }]
          ]
        }
      });
    } catch (e) {}
  }
};

bot.on('photo', async (ctx) => {
  const state = userStates.get(ctx.from.id);
  if (!state || state.action !== 'await_proof') return;
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  await handleProof(ctx, fileId, true);
});

bot.on('document', async (ctx) => {
  const state = userStates.get(ctx.from.id);
  if (!state || state.action !== 'await_proof') return;
  const fileId = ctx.message.document.file_id;
  await handleProof(ctx, fileId, false);
});

bot.action(/^apay_a_(\d+)$/, async (ctx) => {
  if (!ctx.isAdmin) return;
  const userId = parseInt(ctx.match[1]);
  const user = db.getUser(userId);
  if (!user) {
    await ctx.answerCbQuery('❌ Пользователь не найден', { show_alert: true });
    return;
  }
  
  const pending = db.getUserPendingPayments(userId);
  if (pending.length === 0) {
    await ctx.answerCbQuery('❌ Нет ожидающих платежей', { show_alert: true });
    return;
  }
  
  const payment = pending[0];
  db.approvePayment(payment.id);
  db.setUserPremium(userId, payment.tier, 30);
  
  const tierLabel = payment.tier === 2 ? '⭐ Полный' : '📦 Базовый';
  
  try {
    await ctx.editMessageCaption(
      `✅ Платёж подтверждён!\n━━━━━━━━━━━━━━━\n👤 ${user.username || userId}\n📦 ${tierLabel}\n💰 ${payment.amount}`,
      { reply_markup: { inline_keyboard: [] } }
    );
  } catch {
    try {
      await ctx.editMessageText(
        `✅ Платёж подтверждён!\n━━━━━━━━━━━━━━━\n👤 ${user.username || userId}\n📦 ${tierLabel}\n💰 ${payment.amount}`,
        { reply_markup: { inline_keyboard: [] } }
      );
    } catch (e) {}
  }
  
  try {
    const pending = db.getUserPendingPayments(userId);
    if (pending.length > 0 && pending[0].proof_file_id) {
      await ctx.telegram.sendMessage(userId, `🎉 Платёж подтверждён!\n━━━━━━━━━━━━━━━\n📦 Premium ${tierLabel} активирован на 30 дней!\n📝 Дни прибавлены к остатку.`, {
        reply_markup: {
          inline_keyboard: [[{ text: '👤 Профиль', callback_data: 'profile' }]]
        }
      });
    }
  } catch (e) {}
});

bot.action(/^apay_r_(\d+)$/, async (ctx) => {
  if (!ctx.isAdmin) return;
  const userId = parseInt(ctx.match[1]);
  const user = db.getUser(userId);
  
  const pending = db.getUserPendingPayments(userId);
  if (pending.length > 0) {
    db.rejectPayment(pending[0].id, 'Отклонено администратором');
  }
  
  try {
    await ctx.editMessageCaption(
      `❌ Платёж отклонён\n━━━━━━━━━━━━━━━\n👤 ${user?.username || userId}`,
      { reply_markup: { inline_keyboard: [] } }
    );
  } catch {
    try {
      await ctx.editMessageText(
        `❌ Платёж отклонён\n━━━━━━━━━━━━━━━\n👤 ${user?.username || userId}`,
        { reply_markup: { inline_keyboard: [] } }
      );
    } catch (e) {}
  }
});

bot.action('help', async (ctx) => {
  const helpText = `❓ Справка и инструкции\n\n` +
    `🔐 Родительский контроль Steam:\n` +
    `Если вы видите ошибку "Библиотека недоступна", выполните:\n\n` +
    `1️⃣ Откройте Steam на ПК\n` +
    `2️⃣ Перейдите: Настройки → Семья → Семейный просмотр\n` +
    `3️⃣ Введите PIN-код родительского контроля\n` +
    `4️⃣ Нажмите "Отключить семейный просмотр"\n` +
    `5️⃣ Подтвердите действие\n\n` +
    `После этого библиотека будет доступна в боте!\n\n` +
    `📚 Как добавить игры:\n` +
    `• Нажмите "📚 Выбрать из библиотеки" для быстрого выбора\n` +
    `• Или "➕ Добавить игру по ID" для ручного ввода\n` +
    `• Или "⭐️ Выбрать из популярных" для известных игр\n\n` +
    `▶️ Как запустить фарм:\n` +
    `• Добавьте хотя бы одну игру\n` +
    `• Нажмите "▶️ Запустить фарм"\n` +
    `• Бот будет фармить часы автоматически\n\n` +
    `⏸ Как остановить фарм:\n` +
    `• Нажмите "⏸ Остановить фарм"\n` +
    `• Фарм прекратится сразу`;

  await ctx.editMessageText(helpText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 К профилю', callback_data: 'profile' }],
        [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
      ]
    }
  });
});

bot.action('referral', async (ctx) => {
  const referralCount = db.getReferralCount(ctx.from.id);
  const referrerId = ctx.from.id;
  const botUsername = ctx.botInfo?.username || 'SteamFarmWatchRobot';
  const referralLink = `https://t.me/${botUsername}?start=${referrerId}`;
  const earnedDays = referralCount;

  const text = `🎁 Реферальная система\n` +
    `━━━━━━━━━━━━━━━\n` +
    `👥 Приглашено друзей: ${referralCount}\n` +
    `📅 Получено дней: +${earnedDays}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📎 Твоя ссылка:\n` +
    `${referralLink}\n\n` +
    `📌 За каждого друга ты получаешь +1 день!\n` +
    `Бонус начисляется автоматически при регистрации друга по твоей ссылке.`;

  await ctx.editMessageText(text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👥 Список друзей', callback_data: 'referral_list' }],
        [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
      ]
    }
  });
});

bot.action('referral_list', async (ctx) => {
  const text = `👥 Список приглашённых друзей\n━━━━━━━━━━━━━━━\n\n` +
    `📌 Функция в разработке\n\n` +
    `Скоро здесь будет список друзей,\nкоторые перешли по твоей ссылке.`;

  await ctx.editMessageText(text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 К рефералам', callback_data: 'referral' }],
        [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
      ]
    }
  });
});

bot.action('main_menu', async (ctx) => {
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
      ? `\n⚠️ На аккаунте "${needsPinAccounts[0].account_name}" библиотека заблокирована. Установите PIN!`
      : `\n⚠️ На аккаунтах библиотека заблокирована. Установите PIN!`;
    pinButtons = [[{ text: '🔐 Установить PIN', callback_data: `set_pin_${needsPinAccounts[0].id}` }]];
  }
  
  await ctx.editMessageText('📱 Главное меню:' + warningText, {
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

bot.action('accounts', async (ctx) => {
  const accounts = db.getSteamAccounts(ctx.from.id);
  const limit = db.getAccountLimit(ctx.from.id);
  const info = db.getUserSubscriptionInfo(ctx.from.id);
  const PAGE_SIZE = 5;
  const page = 0;
  
  const totalPages = Math.ceil(accounts.length / PAGE_SIZE) || 1;
  const start = page * PAGE_SIZE;
  const pageAccounts = accounts.slice(start, start + PAGE_SIZE);
  
  const accountButtons = pageAccounts.map(acc => [{
    text: `${acc.is_farming ? '🟢' : '⚫'} ${acc.account_name}`,
    callback_data: `account_${acc.id}`
  }]);
  
  const buttons = [...accountButtons];
  
  if (totalPages > 1) {
    buttons.push([{ text: `📄 ${start / PAGE_SIZE + 1}/${totalPages}`, callback_data: 'accounts_page' }]);
  }
  
  if (limit !== 0) {
    buttons.push([{ text: '➕ Добавить аккаунт', callback_data: 'add_account' }]);
  }
  
  const stoppedAccounts = accounts.filter(acc => !acc.is_farming);
  if (stoppedAccounts.length > 0) {
    buttons.push([{ text: '▶️ Запустить все', callback_data: 'start_all' }]);
  }
  
  const runningAccounts = accounts.filter(acc => acc.is_farming);
  if (runningAccounts.length > 0) {
    buttons.push([{ text: '⏸ Остановить все', callback_data: 'stop_all' }]);
  }
  
  buttons.push([{ text: '🔙 Главное меню', callback_data: 'main_menu' }]);
  
  const limitText = limit === -1 ? '∞' : `${accounts.length}/${limit}`;
  const subLabel = info.isPremium ? '⭐ Premium' : limit === 3 ? '❌ Без подписки' : '🎁 Триал';
  const header = `📋 Steam аккаунты\n━━━━━━━━━━━━━━━\n${subLabel} | Аккаунтов: ${limitText}\n`;
  
  await ctx.editMessageText(header, {
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.action('accounts_all', async (ctx) => {
  const accounts = db.getSteamAccounts(ctx.from.id);
  const limit = db.getAccountLimit(ctx.from.id);
  const info = db.getUserSubscriptionInfo(ctx.from.id);
  
  const accountButtons = accounts.map(acc => [{
    text: `${acc.is_farming ? '🟢' : '⚫'} ${acc.account_name}`,
    callback_data: `account_${acc.id}`
  }]);
  
  const buttons = [...accountButtons];
  
  if (limit !== 0) {
    buttons.push([{ text: '➕ Добавить аккаунт', callback_data: 'add_account' }]);
  }
  
  const stoppedAccounts = accounts.filter(acc => !acc.is_farming);
  if (stoppedAccounts.length > 0) {
    buttons.push([{ text: '▶️ Запустить все', callback_data: 'start_all' }]);
  }
  
  const runningAccounts = accounts.filter(acc => acc.is_farming);
  if (runningAccounts.length > 0) {
    buttons.push([{ text: '⏸ Остановить все', callback_data: 'stop_all' }]);
  }
  
  buttons.push([{ text: '📄 Постранично', callback_data: 'accounts' }]);
  buttons.push([{ text: '🔙 Главное меню', callback_data: 'main_menu' }]);
  
  const limitText = limit === -1 ? '∞' : `${accounts.length}/${limit}`;
  const subLabel = info.isPremium ? '⭐ Premium' : limit === 3 ? '❌ Без подписки' : '🎁 Триал';
  const header = `📋 Steam аккаунты\n━━━━━━━━━━━━━━━\n${subLabel} | Аккаунтов: ${limitText}\n`;
  
  await ctx.editMessageText(header, {
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.command('status', async (ctx) => {
  try {
    const statuses = farmManager.getAllFarmsStatus();
    if (!statuses || statuses.length === 0) {
      await ctx.reply('Статусы ферм: нет активных сессий.');
      return;
    }
    const lines = statuses.map(s => {
      const uptime = s.uptime > 0
        ? `${Math.floor(s.uptime / 3600)}ч ${Math.floor((s.uptime % 3600) / 60)}м`
        : '0м';
      const hours = Number.isFinite(s.totalHoursFarmed) ? s.totalHoursFarmed.toFixed(2) : '0.00';
      return `• ${s.accountName}: ${s.isFarming ? '🟢 запущен' : '🔴 остановлен'}; онлайн: ${uptime}; игр: ${s.gamesCount}; часов: ${hours}`;
    }).join('\n');
    await ctx.reply(`Статусы ферм:\n${lines}`);
  } catch (err) {
    await ctx.reply('Ошибка получения статусов: ' + err.message);
  }
});

bot.action('add_account', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (!db.isUserActive(ctx.from.id)) {
    await ctx.editMessageText('❌ Ваш триал истек. Купите Premium для продолжения.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Купить Premium', callback_data: 'buy_premium' }],
          [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
        ]
      }
    });
    return;
  }

  let message;
  try {
    const qrBuffer = await steamAuth.createQRAuth(ctx.from.id);
    
    message = await ctx.replyWithPhoto(
      { source: qrBuffer },
      {
        caption: '📱 Отсканируйте QR-код в приложении Steam:\n\n' +
                 '1. Откройте Steam на телефоне\n' +
                 '2. Меню → Войти через QR-код\n' +
                 '3. Наведите камеру на код\n\n' +
                 '⏱ Код действителен 2 минуты',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отменить', callback_data: 'cancel_qr' }]
          ]
        }
      }
    );

    const result = await steamAuth.waitForQRConfirmation(ctx.from.id);

    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, message.message_id);
    } catch (err) {
      console.error('Не удалось удалить сообщение:', err);
    }

    await ctx.reply(`✅ Аккаунт ${result.accountName} успешно добавлен!\n\nПроверяю доступность библиотеки...`);

    let hasParental = false;
    try {
      hasParental = await steamLibrary.checkParentalControl(result.accountId);
      db.updateParentalControlStatus(result.accountId, hasParental);
    } catch (err) {
      console.error('Ошибка проверки родительского контроля:', err);
    }

    if (hasParental) {
      let availableGamesText = '';
      try {
        const libraryGames = await steamLibrary.getOwnedGames(result.accountId);
        
        if (libraryGames.length === 0) {
          availableGamesText = '\n\n❌ Библиотека недоступна из-за родительского контроля.\n' +
                              '📝 Для доступа к играм:\n' +
                              '1. Откройте Steam на ПК\n' +
                              '2. Настройки → Семья → Семейный просмотр\n' +
                              '3. Введите PIN-код и отключите ограничения\n' +
                              '4. Или добавьте игры вручную по App ID';
        } else {
          availableGamesText = `\n\n✅ Доступно игр: ${libraryGames.length}\n` +
                              'Библиотека загружена успешно!';
        }
      } catch (err) {
        availableGamesText = `\n\n⚠️ Не удалось загрузить библиотеку\n` +
                            `Причина: ${err.message}\n\n` +
                            `Вы можете добавить игры вручную по App ID.`;
      }

      await ctx.reply(
        `🎮 Аккаунт готов к использованию!${availableGamesText}\n\n` +
        `Теперь вы можете настроить игры для фарма.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Настроить игры', callback_data: `games_${result.accountId}` }],
              [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }],
              [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    } else {
      await ctx.reply(
        `🎮 Аккаунт готов к использованию!\n\n` +
        `Теперь вы можете настроить игры для фарма.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Настроить игры', callback_data: `games_${result.accountId}` }],
              [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }],
              [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    }

  } catch (error) {
    console.error('Ошибка добавления аккаунта:', error);
    
    let errorMsg = '❌ Ошибка при добавлении аккаунта';
    if (error.message.includes('лимит')) {
      errorMsg = `❌ ${error.message}`;
    } else if (error.message.includes('истекло')) {
      errorMsg = '⏱ Время ожидания истекло. Попробуйте снова.';
    }

    if (message) {
      await ctx.telegram.editMessageCaption(
        ctx.chat.id,
        message.message_id,
        undefined,
        errorMsg,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Попробовать снова', callback_data: 'add_account' }],
              [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    } else {
      await ctx.reply(errorMsg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Попробовать снова', callback_data: 'add_account' }],
            [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
          ]
        }
      });
    }
  }
});

bot.action('cancel_qr', async (ctx) => {
  steamAuth.cancelQRAuth(ctx.from.id);
  await ctx.editMessageCaption('❌ Авторизация отменена', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
      ]
    }
  });
});

bot.action('start_all', async (ctx) => {
  const accounts = db.getSteamAccounts(ctx.from.id);
  const stoppedAccounts = accounts.filter(acc => !acc.is_farming);
  
  if (stoppedAccounts.length === 0) {
    await ctx.answerCbQuery('✅ Все аккаунты уже запущены');
    return;
  }
  
  await ctx.answerCbQuery(`⏳ Запускаю ${stoppedAccounts.length} аккаунтов...`);
  
  for (const account of stoppedAccounts) {
    try {
      await farmManager.startFarming(account.id);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Ошибка запуска ${account.account_name}:`, error.message);
    }
  }
  
  try {
    await ctx.deleteMessage();
  } catch (delErr) {
    console.error('Не удалось удалить сообщение:', delErr.message);
  }
  
  await showAccountsList(ctx);
});

bot.action('stop_all', async (ctx) => {
  const accounts = db.getSteamAccounts(ctx.from.id);
  const runningAccounts = accounts.filter(acc => acc.is_farming);
  
  if (runningAccounts.length === 0) {
    await ctx.answerCbQuery('✅ Все аккаунты уже остановлены');
    return;
  }
  
  await ctx.answerCbQuery(`⏳ Останавливаю ${runningAccounts.length} аккаунтов...`);
  
  for (const account of runningAccounts) {
    try {
      await farmManager.stopFarming(account.id);
    } catch (error) {
      console.error(`Ошибка остановки ${account.account_name}:`, error.message);
    }
  }
  
  try {
    await ctx.deleteMessage();
  } catch (delErr) {
    console.error('Не удалось удалить сообщение:', delErr.message);
  }
  
  await showAccountsList(ctx);
});

async function showAccountsList(ctx) {
  const accounts = db.getSteamAccounts(ctx.from.id);
  const limit = db.getAccountLimit(ctx.from.id);
  const info = db.getUserSubscriptionInfo(ctx.from.id);
  const PAGE_SIZE = 5;
  const page = 0;
  
  const totalPages = Math.ceil(accounts.length / PAGE_SIZE) || 1;
  const start = page * PAGE_SIZE;
  const pageAccounts = accounts.slice(start, start + PAGE_SIZE);
  
  const accountButtons = pageAccounts.map(acc => [{
    text: `${acc.is_farming ? '🟢' : '⚫'} ${acc.account_name}`,
    callback_data: `account_${acc.id}`
  }]);
  
  const buttons = [...accountButtons];
  
  if (totalPages > 1) {
    buttons.push([{ text: `📄 ${start / PAGE_SIZE + 1}/${totalPages}`, callback_data: 'accounts_page' }]);
  }
  
  if (limit !== 0) {
    buttons.push([{ text: '➕ Добавить аккаунт', callback_data: 'add_account' }]);
  }
  
  const stoppedAccounts = accounts.filter(acc => !acc.is_farming);
  if (stoppedAccounts.length > 0) {
    buttons.push([{ text: '▶️ Запустить все', callback_data: 'start_all' }]);
  }
  
  const runningAccounts = accounts.filter(acc => acc.is_farming);
  if (runningAccounts.length > 0) {
    buttons.push([{ text: '⏸ Остановить все', callback_data: 'stop_all' }]);
  }
  
  buttons.push([{ text: '🔙 Главное меню', callback_data: 'main_menu' }]);
  
  const limitText = limit === -1 ? '∞' : `${accounts.length}/${limit}`;
  const subLabel = info.isPremium ? '⭐ Premium' : limit === 3 ? '❌ Без подписки' : '🎁 Триал';
  const header = `📋 Steam аккаунты\n━━━━━━━━━━━━━━━\n${subLabel} | Аккаунтов: ${limitText}\n`;
  
  await ctx.reply(header, {
    reply_markup: { inline_keyboard: buttons }
  });
}

bot.action(/^change_status_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  const currentStatus = account.custom_status || 'Не установлен';
  
  userStates.set(ctx.from.id, { action: 'change_status', accountId });
  
  await ctx.editMessageText(
    `💬 Изменение статуса для ${account.account_name}\n\n` +
    `Текущий статус: ${currentStatus}\n\n` +
    `Отправьте новый статус (например: "Metro Exodus" или "Отдыхаю")\n` +
    `Максимум 100 символов.\n\n` +
    `Чтобы сбросить статус, отправьте: -`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Отмена', callback_data: `account_${accountId}` }]
        ]
      }
    }
  );
});

bot.action(/^visibility_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);

  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  const currentMode = db.getVisibilityMode(accountId);
  const newMode = currentMode === 0 ? 1 : 0;
  db.setVisibilityMode(accountId, newMode);

  const isFarming = farmManager.isFarming(accountId);
  if (isFarming) {
    await farmManager.restartFarming(accountId);
  }

  await ctx.answerCbQuery(
    newMode === 0 ? '🌐 Режим: В сети' : '👻 Режим: Невидимка'
  );

  await new Promise(resolve => setTimeout(resolve, 1500));

  const updatedAccount = db.getSteamAccount(accountId);
  const games = db.getGames(accountId);
  const text = formatter.formatAccountInfo(updatedAccount, games);

  const buttons = [];

  if (updatedAccount.is_farming) {
    buttons.push([{ text: '⏸ Остановить фарм', callback_data: `stop_${accountId}` }]);
  } else {
    buttons.push([{ text: '▶️ Запустить фарм', callback_data: `start_${accountId}` }]);
  }

  buttons.push([{ text: '🎮 Настроить игры', callback_data: `games_${accountId}` }]);
  buttons.push([{ text: '💬 Изменить статус', callback_data: `change_status_${accountId}` }]);
  buttons.push([{ text: '👁 Видимость', callback_data: `visibility_${accountId}` }]);
  if (account.has_parental_control) {
    buttons.push([{ text: '🔐 PIN родительского контроля', callback_data: `set_pin_${accountId}` }]);
  }
  buttons.push([{ text: '🗑 Удалить аккаунт', callback_data: `delete_${accountId}` }]);
  buttons.push([{ text: '🔙 К списку аккаунтов', callback_data: 'accounts' }]);

  await ctx.editMessageText(text, {
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.action(/^set_pin_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);

  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  if (!account.has_parental_control) {
    await ctx.answerCbQuery('❌ На этом аккаунте нет родительского контроля', { show_alert: true });
    return;
  }

  const messageId = ctx.callbackQuery.message.message_id;
  userStates.set(ctx.from.id, { action: 'set_pin', accountId, messageId });

  const currentPin = db.getFamilyPin(accountId);
  const currentStatus = currentPin ? 'Текущий PIN установлен' : 'PIN не установлен';

  await ctx.editMessageText(
    `🔐 PIN родительского контроля для ${account.account_name}\n\n` +
    `${currentStatus}\n\n` +
    `Отправьте PIN-код от родительского контроля Steam (4 цифры).\n\n` +
    `💡 Где найти: Steam → Настройки → Семья → Управление семейным просмотром\n\n` +
    `Если PIN не установлен — отправьте "0", чтобы удалить текущий.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Отмена', callback_data: `account_${accountId}` }]
        ]
      }
    }
  );
});

bot.action(/^account_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  const games = db.getGames(accountId);
  const text = formatter.formatAccountInfo(account, games);

  const buttons = [];
  
  if (account.is_farming) {
    buttons.push([{ text: '⏸ Остановить фарм', callback_data: `stop_${accountId}` }]);
  } else {
    buttons.push([{ text: '▶️ Запустить фарм', callback_data: `start_${accountId}` }]);
  }
  
  buttons.push([{ text: '🎮 Настроить игры', callback_data: `games_${accountId}` }]);
  buttons.push([{ text: '💬 Изменить статус', callback_data: `change_status_${accountId}` }]);
  buttons.push([{ text: '👁 Видимость', callback_data: `visibility_${accountId}` }]);
  if (account.has_parental_control) {
    buttons.push([{ text: '🔐 PIN родительского контроля', callback_data: `set_pin_${accountId}` }]);
  }
  buttons.push([{ text: '🗑 Удалить аккаунт', callback_data: `delete_${accountId}` }]);
  buttons.push([{ text: '🔙 К списку аккаунтов', callback_data: 'accounts' }]);

  try {
    await ctx.editMessageText(text, {
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (err) {
    if (err.message.includes('not modified')) {
      await ctx.answerCbQuery('✅');
    } else {
      throw err;
    }
  }
});

bot.action(/^start_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  try {
    await farmManager.startFarming(accountId);
    await ctx.answerCbQuery('✅ Фарм запущен');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const updatedAccount = db.getSteamAccount(accountId);
    const games = db.getGames(accountId);
    const text = formatter.formatAccountInfo(updatedAccount, games);

    const buttons = [];
    
    if (updatedAccount.is_farming) {
      buttons.push([{ text: '⏸ Остановить фарм', callback_data: `stop_${accountId}` }]);
    } else {
      buttons.push([{ text: '▶️ Запустить фарм', callback_data: `start_${accountId}` }]);
    }
    
    buttons.push([{ text: '🎮 Настроить игры', callback_data: `games_${accountId}` }]);
    buttons.push([{ text: '💬 Изменить статус', callback_data: `change_status_${accountId}` }]);
    buttons.push([{ text: '👁 Видимость', callback_data: `visibility_${accountId}` }]);
    buttons.push([{ text: '🔐 PIN родительского контроля', callback_data: `set_pin_${accountId}` }]);
    buttons.push([{ text: '🗑 Удалить аккаунт', callback_data: `delete_${accountId}` }]);
    buttons.push([{ text: '🔙 К списку аккаунтов', callback_data: 'accounts' }]);

    await ctx.editMessageText(text, {
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (error) {
    await ctx.answerCbQuery(`❌ ${error.message}`, { show_alert: true });
  }
});

bot.action(/^stop_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  try {
    await farmManager.stopFarming(accountId);
    await ctx.answerCbQuery('✅ Фарм остановлен');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const updatedAccount = db.getSteamAccount(accountId);
    const games = db.getGames(accountId);
    const text = formatter.formatAccountInfo(updatedAccount, games);

    const buttons = [];
    
    if (updatedAccount.is_farming) {
      buttons.push([{ text: '⏸ Остановить фарм', callback_data: `stop_${accountId}` }]);
    } else {
      buttons.push([{ text: '▶️ Запустить фарм', callback_data: `start_${accountId}` }]);
    }
    
    buttons.push([{ text: '🎮 Настроить игры', callback_data: `games_${accountId}` }]);
    buttons.push([{ text: '💬 Изменить статус', callback_data: `change_status_${accountId}` }]);
    buttons.push([{ text: '👁 Видимость', callback_data: `visibility_${accountId}` }]);
    buttons.push([{ text: '🔐 PIN родительского контроля', callback_data: `set_pin_${accountId}` }]);
    buttons.push([{ text: '🗑 Удалить аккаунт', callback_data: `delete_${accountId}` }]);
    buttons.push([{ text: '🔙 К списку аккаунтов', callback_data: 'accounts' }]);

    await ctx.editMessageText(text, {
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (error) {
    await ctx.answerCbQuery(`❌ ${error.message}`, { show_alert: true });
  }
});

bot.action(/^delete_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  await ctx.editMessageText(
    `⚠️ Вы уверены, что хотите удалить аккаунт ${account.account_name}?\n\n` +
    `Все настройки и игры будут удалены.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Да, удалить', callback_data: `confirm_delete_${accountId}` }],
          [{ text: '❌ Отмена', callback_data: `account_${accountId}` }]
        ]
      }
    }
  );
});

bot.action(/^confirm_delete_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  if (account.is_farming) {
    try {
      farmManager.stopFarming(accountId);
    } catch (err) {
      console.error('Ошибка остановки фарма:', err);
    }
  }

  db.deleteSteamAccount(accountId);
  
  await ctx.answerCbQuery('✅ Аккаунт удален');
  
  ctx.callbackQuery.data = 'accounts';
  await bot.handleUpdate({ callback_query: ctx.callbackQuery });
});

bot.action(/^games_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  const games = db.getGames(accountId);
  
  let text = `🎮 Игры для ${account.account_name}\n\n`;
  text += formatter.formatGamesList(games);
  text += `\n\nВсего: ${games.length}/${MAX_GAMES_PER_ACCOUNT}`;

  const buttons = [
    [{ text: '📚 Выбрать из библиотеки', callback_data: `library_${accountId}` }],
    [{ text: '➕ Добавить игру по ID', callback_data: `add_game_${accountId}` }],
    [{ text: '⭐️ Выбрать из популярных', callback_data: `popular_${accountId}` }]
  ];

  if (games.length > 0) {
    buttons.push([{ text: '🗑 Очистить список', callback_data: `clear_games_${accountId}` }]);
  }

  buttons.push([{ text: '🔙 Назад', callback_data: `account_${accountId}` }]);

  try {
    if (ctx.callbackQuery.message.photo) {
      await ctx.reply(text, {
        reply_markup: { inline_keyboard: buttons }
      });
    } else {
      await ctx.editMessageText(text, {
        reply_markup: { inline_keyboard: buttons }
      });
    }
  } catch (err) {
    await ctx.reply(text, {
      reply_markup: { inline_keyboard: buttons }
    });
  }
});

bot.action(/^add_game_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  
  userStates.set(ctx.from.id, { action: 'add_game', accountId });
  
  await ctx.reply(
    '🎮 Отправьте App ID игры (например: 730 для CS2)\n\n' +
    'Найти App ID можно в URL страницы игры в Steam.',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Отмена', callback_data: `games_${accountId}` }]
        ]
      }
    }
  );
});

bot.action(/^popular_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  await ctx.answerCbQuery('⏳ Загружаю топ-10 игр...');
  
  try {
    const topGames = await steamLibrary.getTopPlayedGames(accountId);
    
    if (topGames.length === 0) {
      await ctx.editMessageText('📭 Нет данных о времени игры\n\nПоказываю библиотеку вместо этого...', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📚 Выбрать из библиотеки', callback_data: `library_${accountId}` }],
            [{ text: '🔙 Назад', callback_data: `games_${accountId}` }]
          ]
        }
      });
      return;
    }
    
    const buttons = topGames.map(game => {
      const hours = Math.floor(game.playtime_forever / 60);
      const mins = game.playtime_forever % 60;
      const timeStr = hours > 0 ? `${hours}ч ${mins}мин` : `${mins}мин`;
      return [{
        text: `${game.name} (${timeStr})`,
        callback_data: `add_top_${accountId}_${game.appId}`
      }];
    });
    
    buttons.push([{ text: '🔙 Назад', callback_data: `games_${accountId}` }]);

    await ctx.editMessageText('🏆 Топ-10 игр по времени игры:', {
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (error) {
    console.error('Ошибка получения топ игр:', error);
    await ctx.editMessageText('❌ Не удалось загрузить топ игр', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад', callback_data: `games_${accountId}` }]
        ]
      }
    });
  }
});

bot.action(/^add_popular_(\d+)_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const appId = parseInt(ctx.match[2]);
  
  const account = db.getSteamAccount(accountId);
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  const games = db.getGames(accountId);
  if (games.length >= MAX_GAMES_PER_ACCOUNT) {
    await ctx.answerCbQuery(`❌ Достигнут лимит игр (${MAX_GAMES_PER_ACCOUNT})`, { show_alert: true });
    return;
  }

  const game = POPULAR_GAMES.find(g => g.appId === appId);
  const result = db.addGame(accountId, appId, game.name);
  
  if (result === null) {
    await ctx.answerCbQuery('⚠️ Игра уже добавлена');
  } else {
    await ctx.answerCbQuery(`✅ ${game.name} добавлена`);
    
    if (account.is_farming) {
      try {
        await farmManager.restartFarming(accountId);
        await ctx.reply('🔄 Фарм перезапущен с новой игрой');
      } catch (err) {
        console.error('Ошибка перезапуска:', err);
      }
    }
  }
  
  ctx.callbackQuery.data = `games_${accountId}`;
  await bot.handleUpdate({ callback_query: ctx.callbackQuery });
});

bot.action(/^add_top_(\d+)_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const appId = parseInt(ctx.match[2]);
  
  const account = db.getSteamAccount(accountId);
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  const games = db.getGames(accountId);
  if (games.length >= MAX_GAMES_PER_ACCOUNT) {
    await ctx.answerCbQuery(`❌ Достигнут лимит игр (${MAX_GAMES_PER_ACCOUNT})`, { show_alert: true });
    return;
  }

  const state = userStates.get(ctx.from.id);
  const game = state?.topGames?.find(g => g.appId === appId);
  const gameName = game?.name || `App ${appId}`;
  
  const result = db.addGame(accountId, appId, gameName);
  
  if (result === null) {
    await ctx.answerCbQuery('⚠️ Игра уже добавлена');
  } else {
    await ctx.answerCbQuery(`✅ ${gameName} добавлена`);
    
    if (account.is_farming) {
      try {
        await farmManager.restartFarming(accountId);
        await ctx.reply('🔄 Фарм перезапущен с новой игрой');
      } catch (err) {
        console.error('Ошибка перезапуска:', err);
      }
    }
  }
  
  ctx.callbackQuery.data = `games_${accountId}`;
  await bot.handleUpdate({ callback_query: ctx.callbackQuery });
});

bot.action(/^library_(\d+)(?:_page_(\d+))?(?:_refresh)?$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const page = parseInt(ctx.match[2] || '0');
  const forceRefresh = ctx.match[0].includes('_refresh');
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  let libraryGames = [];
  
  if (!forceRefresh) {
    const cachedGames = db.getCachedLibrary(accountId);
    const cacheTime = db.getLibraryCacheTime(accountId);
    
    if (cachedGames.length > 0) {
      await ctx.answerCbQuery('✅ Загружено из кеша');
      libraryGames = cachedGames.map(g => ({ appId: g.app_id, name: g.game_name }));
      
      userStates.set(ctx.from.id, { 
        action: 'library_select', 
        accountId, 
        libraryGames 
      });
      
      showLibraryPage(ctx, accountId, page, libraryGames, cacheTime);
      return;
    }
  }
  
  await ctx.answerCbQuery('⏳ Загружаю библиотеку из Steam...');
  
  await ctx.editMessageText('⏳ Загружаю вашу библиотеку Steam...\n\nЭто может занять до 3 минут для больших библиотек.');
  
  try {
    libraryGames = await steamLibrary.getOwnedGames(accountId);
    
    if (libraryGames.length === 0) {
      await ctx.editMessageText('📭 Библиотека пуста или не удалось загрузить игры', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: `games_${accountId}` }]
          ]
        }
      });
      return;
    }
    
    db.saveCachedLibrary(accountId, libraryGames);
    
    userStates.set(ctx.from.id, { 
      action: 'library_select', 
      accountId, 
      libraryGames 
    });
    
    showLibraryPage(ctx, accountId, page, libraryGames, Math.floor(Date.now() / 1000));
    
  } catch (error) {
    console.error('Ошибка загрузки библиотеки:', error);
    await ctx.editMessageText(
      `❌ Не удалось загрузить библиотеку\n\n` +
      `Ошибка: ${error.message}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Попробовать снова', callback_data: `library_${accountId}_refresh` }],
            [{ text: '🔙 Назад', callback_data: `games_${accountId}` }]
          ]
        }
      }
    );
  }
});

async function showLibraryPage(ctx, accountId, page, libraryGames, cacheTime) {
  const selectedGames = db.getGames(accountId);
  const selectedIds = selectedGames.map(g => g.app_id);
  
  const gamesPerPage = 15;
  const totalPages = Math.ceil(libraryGames.length / gamesPerPage);
  const startIdx = page * gamesPerPage;
  const endIdx = Math.min(startIdx + gamesPerPage, libraryGames.length);
  const gamesToShow = libraryGames.slice(startIdx, endIdx);
  
  const buttons = gamesToShow.map(game => {
    const isSelected = selectedIds.includes(game.appId);
    const icon = isSelected ? '✅' : '⬜️';
    return [{
      text: `${icon} ${game.name}`,
      callback_data: `toggle_lib_${accountId}_${game.appId}_${page}`
    }];
  });
  
  const navButtons = [];
  if (page > 0) {
    navButtons.push({ text: '⬅️ Назад', callback_data: `library_${accountId}_page_${page - 1}` });
  }
  if (page < totalPages - 1) {
    navButtons.push({ text: 'Вперёд ➡️', callback_data: `library_${accountId}_page_${page + 1}` });
  }
  if (navButtons.length > 0) {
    buttons.push(navButtons);
  }
  
  const now = Math.floor(Date.now() / 1000);
  const cacheAge = Math.floor((now - cacheTime) / 60);
  const cacheInfo = cacheTime > 0 ? `\n💾 Кеш: ${cacheAge} мин. назад` : '';
  
  buttons.push([{ text: '🔄 Обновить библиотеку', callback_data: `library_${accountId}_page_0_refresh` }]);
  buttons.push([{ text: '✅ Готово', callback_data: `games_${accountId}` }]);
  buttons.push([{ text: '🔙 Назад', callback_data: `games_${accountId}` }]);

  try {
    await ctx.editMessageText(
      `📚 Ваша библиотека. Страница ${page + 1}:\n` +
      `Показано ${startIdx + 1}-${endIdx} из ${libraryGames.length} игр${cacheInfo}\n\n` +
      'Нажмите на игру, чтобы добавить/убрать её из списка.',
      {
        reply_markup: { inline_keyboard: buttons }
      }
    );
  } catch (err) {
    if (!err.message.includes('message is not modified')) {
      throw err;
    }
  }
}

bot.action(/^toggle_lib_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const appId = parseInt(ctx.match[2]);
  const page = parseInt(ctx.match[3]);
  
  const account = db.getSteamAccount(accountId);
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  const games = db.getGames(accountId);
  const isSelected = games.some(g => g.app_id === appId);
  
  if (isSelected) {
    db.removeGame(accountId, appId);
    await ctx.answerCbQuery('➖ Игра убрана');
    
    if (account.is_farming) {
      try {
        await farmManager.restartFarming(accountId);
        await ctx.reply('🔄 Фарм перезапущен с новым списком игр');
      } catch (err) {
        console.error('Ошибка перезапуска:', err);
      }
    }
  } else {
    if (games.length >= MAX_GAMES_PER_ACCOUNT) {
      await ctx.answerCbQuery(`❌ Достигнут лимит игр (${MAX_GAMES_PER_ACCOUNT})`, { show_alert: true });
      return;
    }
    
    const state = userStates.get(ctx.from.id);
    const game = state?.libraryGames?.find(g => g.appId === appId);
    db.addGame(accountId, appId, game?.name);
    await ctx.answerCbQuery('➕ Игра добавлена');
    
    if (account.is_farming) {
      try {
        await farmManager.restartFarming(accountId);
        await ctx.reply('🔄 Фарм перезапущен с новой игрой');
      } catch (err) {
        console.error('Ошибка перезапуска:', err);
      }
    }
  }
  
  ctx.callbackQuery.data = `library_${accountId}_page_${page}`;
  await bot.handleUpdate({ callback_query: ctx.callbackQuery });
});

bot.action(/^toggle_game_(\d+)_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const appId = parseInt(ctx.match[2]);
  
  const account = db.getSteamAccount(accountId);
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  const games = db.getGames(accountId);
  const isSelected = games.some(g => g.app_id === appId);
  
  if (isSelected) {
    db.removeGame(accountId, appId);
    await ctx.answerCbQuery('➖ Игра убрана');
  } else {
    if (games.length >= MAX_GAMES_PER_ACCOUNT) {
      await ctx.answerCbQuery(`❌ Достигнут лимит игр (${MAX_GAMES_PER_ACCOUNT})`, { show_alert: true });
      return;
    }
    
    const game = POPULAR_GAMES.find(g => g.appId === appId);
    db.addGame(accountId, appId, game?.name);
    await ctx.answerCbQuery('➕ Игра добавлена');
  }
  
  const selectedGames = db.getGames(accountId);
  const selectedIds = selectedGames.map(g => g.app_id);
  
  const buttons = POPULAR_GAMES.map(game => {
    const isNowSelected = selectedIds.includes(game.appId);
    const icon = isNowSelected ? '✅' : '⬜️';
    return [{
      text: `${icon} ${game.name}`,
      callback_data: `toggle_game_${accountId}_${game.appId}`
    }];
  });
  
  buttons.push([{ text: '✅ Готово', callback_data: `games_${accountId}` }]);
  buttons.push([{ text: '🔙 Назад', callback_data: `games_${accountId}` }]);

  await ctx.editMessageText(
    '📚 Выберите игры для фарма:\n\n' +
    'Нажмите на игру, чтобы добавить/убрать её из списка.',
    {
      reply_markup: { inline_keyboard: buttons }
    }
  );
});

bot.action(/^clear_games_(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1]);
  const account = db.getSteamAccount(accountId);
  
  if (!account || account.user_id !== ctx.from.id) {
    await ctx.answerCbQuery('❌ Аккаунт не найден');
    return;
  }

  db.clearGames(accountId);
  await ctx.answerCbQuery('✅ Список игр очищен');
  
  ctx.callbackQuery.data = `games_${accountId}`;
  await bot.handleUpdate({ callback_query: ctx.callbackQuery });
});

bot.on('text', async (ctx) => {
  const state = userStates.get(ctx.from.id);
  
  if (!state) {
    return;
  }

  if (state.action === 'add_game') {
    const appId = parseInt(ctx.message.text);
    
    if (isNaN(appId) || appId <= 0) {
      await ctx.reply('❌ Неверный формат. Введите числовой App ID.');
      return;
    }

    const account = db.getSteamAccount(state.accountId);
    if (!account || account.user_id !== ctx.from.id) {
      await ctx.reply('❌ Аккаунт не найден');
      userStates.delete(ctx.from.id);
      return;
    }

    const games = db.getGames(state.accountId);
    if (games.length >= MAX_GAMES_PER_ACCOUNT) {
      await ctx.reply(`❌ Достигнут лимит игр (${MAX_GAMES_PER_ACCOUNT})`);
      userStates.delete(ctx.from.id);
      return;
    }

    const result = db.addGame(state.accountId, appId);
    
    if (result === null) {
      await ctx.reply('⚠️ Игра уже добавлена');
    } else {
      await ctx.reply(`✅ Игра с ID ${appId} добавлена`);
    }

    userStates.delete(ctx.from.id);
    
    await ctx.reply('🎮 Настройка игр:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 К списку игр', callback_data: `games_${state.accountId}` }]
        ]
      }
    });
  }
  
  if (state.action === 'change_status') {
    const customStatus = ctx.message.text.trim();
    
    if (customStatus === '-') {
      db.updateCustomStatus(state.accountId, null);
      userStates.delete(ctx.from.id);
      
      await ctx.reply(`✅ Статус сброшен. Будет использоваться стандартный статус Steam.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 К аккаунту', callback_data: `account_${state.accountId}` }]
          ]
        }
      });
      return;
    }
    
    if (customStatus.length > 100) {
      await ctx.reply('❌ Статус слишком длинный. Максимум 100 символов.');
      return;
    }

    const account = db.getSteamAccount(state.accountId);
    if (!account || account.user_id !== ctx.from.id) {
      await ctx.reply('❌ Аккаунт не найден');
      userStates.delete(ctx.from.id);
      return;
    }

    db.updateCustomStatus(state.accountId, customStatus);
    userStates.delete(ctx.from.id);
    
    await ctx.reply(`✅ Статус обновлен: "${customStatus}"\n\nСтатус будет применен при следующем запуске фарма.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 К аккаунту', callback_data: `account_${state.accountId}` }]
        ]
      }
    });
  }

  if (state.action === 'set_pin') {
    const pinInput = ctx.message.text.trim();

    const account = db.getSteamAccount(state.accountId);
    if (!account || account.user_id !== ctx.from.id) {
      userStates.delete(ctx.from.id);
      return;
    }

    if (pinInput === '0') {
      db.setFamilyPin(state.accountId, null);
      userStates.delete(ctx.from.id);
      
      await ctx.deleteMessage().catch(() => {});
      try {
        await ctx.telegram.deleteMessage(ctx.from.id, state.messageId);
      } catch {}
      
      await ctx.reply(`✅ PIN удален.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 К аккаунту', callback_data: `account_${state.accountId}` }]
          ]
        }
      });
      return;
    }

    if (!/^\d{4}$/.test(pinInput)) {
      await ctx.reply('❌ PIN должен быть 4 цифры (например: 1234)');
      return;
    }

    db.setFamilyPin(state.accountId, pinInput);
    userStates.delete(ctx.from.id);

    await ctx.deleteMessage().catch(() => {});
    try {
      await ctx.telegram.deleteMessage(ctx.from.id, state.messageId);
    } catch {}

    await ctx.reply(`✅ PIN установлен.\n\nЕсли Steam запросит PIN при запуске фарма — бот автоматически введет его.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 К аккаунту', callback_data: `account_${state.accountId}` }]
        ]
      }
    });
  }
});

// ===== ADMIN =====
const adminStates = new Map();

bot.command('admin', async (ctx) => {
  if (!ctx.isAdmin) {
    await ctx.reply('❌ Доступ запрещён');
    return;
  }
  
  const users = db.getAllUsers();
  const totalUsers = users.length;
  const activeUsers = users.filter(u => db.isUserActive(u.telegram_id)).length;
  const premiumUsers = users.filter(u => u.premium_expires_at > Math.floor(Date.now() / 1000)).length;
  const bannedUsers = users.filter(u => u.is_banned === 1).length;
  const farms = farmManager.getActiveFarms();
  
  let text = `🔧 Админ-панель\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `👥 Всего пользователей: ${totalUsers}\n`;
  text += `✅ Активных: ${activeUsers}\n`;
  text += `⭐ Premium: ${premiumUsers}\n`;
  text += `🚫 Заблокированных: ${bannedUsers}\n`;
  text += `📡 Фарм-сессий: ${farms.length}\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `📋 Команды:\n`;
  text += `/admin users — список пользователей\n`;
  text += `/admin give <id> <tier> <days> — выдать Premium\n`;
  text += `/admin revoke <id> — отозвать Premium\n`;
  text += `/admin ban <id> — заблокировать\n`;
  text += `/admin unban <id> — разблокировать\n`;
  text += `/admin stats — статистика\n`;
  text += `/admin broadcast <текст> — рассылка\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `💳 Платежи:\n`;
  text += `/apay_list — ожидающие платежи\n`;
  text += `/apay_view <id> — посмотреть платёж\n`;
  text += `/apay_approve <user_id> — подтвердить\n`;
  text += `/apay_reject <user_id> [причина] — отклонить`;
  
  await ctx.reply(text);
});

bot.command('admin_users', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const users = db.getAllUsers();
  const now = Math.floor(Date.now() / 1000);
  
  let text = `👥 Пользователи (${users.length})\n━━━━━━━━━━━━━━━\n`;
  
  for (const user of users.slice(0, 20)) {
    const info = db.getUserSubscriptionInfo(user.telegram_id);
    const accounts = db.getSteamAccounts(user.telegram_id);
    let status = '❌';
    if (info.isBanned) status = '🚫';
    else if (info.isPremium) status = info.tier === 2 ? '⭐' : '📦';
    else if (info.isTrial) status = '🎁';
    
    const daysLeft = info.isPremium
      ? Math.ceil((info.expiresAt - now) / 86400)
      : info.isTrial ? Math.ceil((info.trialEndsAt - now) / 86400) : 0;
    
    text += `${status} ${user.username || '—'} [${user.telegram_id}]\n`;
    text += `   Акк: ${accounts.length} | ${daysLeft > 0 ? daysLeft + 'д.' : '—'}\n`;
  }
  
  if (users.length > 20) text += `\n... и ещё ${users.length - 20}`;
  
  await ctx.reply(text);
});

bot.command('admin_give', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 3) {
    await ctx.reply('📖 Использование: /admin_give <telegram_id> <tier> <days>\ntier: 1=Базовый, 2=Полный');
    return;
  }
  
  const telegramId = parseInt(args[0]);
  const tier = parseInt(args[1]);
  const days = parseInt(args[2]);
  
  if (isNaN(telegramId) || isNaN(tier) || isNaN(days) || tier < 1 || tier > 2 || days < 1) {
    await ctx.reply('❌ Неверные параметры');
    return;
  }
  
  const user = db.getUser(telegramId);
  if (!user) {
    await ctx.reply(`❌ Пользователь ${telegramId} не найден`);
    return;
  }
  
  db.setUserPremium(telegramId, tier, days);
  const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
  
  await ctx.reply(`✅ ${user.username || telegramId} выдан ${tierLabel} на ${days} дней`);
  
  try {
    await ctx.telegram.sendMessage(telegramId, `🎉 Вам выдан Premium ${tierLabel} на ${days} дней!\nСпасибо за поддержку!`);
  } catch (e) {
    await ctx.reply(`⚠️ Не удалось уведомить пользователя`);
  }
});

bot.command('admin_revoke', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    await ctx.reply('📖 Использование: /admin_revoke <telegram_id>');
    return;
  }
  
  const telegramId = parseInt(args[0]);
  const user = db.getUser(telegramId);
  if (!user) {
    await ctx.reply(`❌ Пользователь ${telegramId} не найден`);
    return;
  }
  
  db.prepare('UPDATE users SET premium_tier = 0, premium_expires_at = 0, is_premium = 0 WHERE telegram_id = ?').run(telegramId);
  await ctx.reply(`✅ Premium отозван у ${user.username || telegramId}`);
  
  try {
    await ctx.telegram.sendMessage(telegramId, '⚠️ Ваш Premium был отозван.');
  } catch (e) {}
});

bot.command('admin_ban', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    await ctx.reply('📖 Использование: /admin_ban <telegram_id>');
    return;
  }
  
  const telegramId = parseInt(args[0]);
  const user = db.getUser(telegramId);
  if (!user) {
    await ctx.reply(`❌ Пользователь ${telegramId} не найден`);
    return;
  }
  
  db.banUser(telegramId, true);
  
  if (farmManager.isFarming(telegramId)) {
    const accounts = db.getSteamAccounts(telegramId);
    for (const acc of accounts) {
      if (acc.is_farming) {
        await farmManager.stopFarming(acc.id);
      }
    }
  }
  
  await ctx.reply(`🚫 Пользователь ${user.username || telegramId} заблокирован`);
  
  try {
    await ctx.telegram.sendMessage(telegramId, '🚫 Вы заблокированы.');
  } catch (e) {}
});

bot.command('admin_unban', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    await ctx.reply('📖 Использование: /admin_unban <telegram_id>');
    return;
  }
  
  const telegramId = parseInt(args[0]);
  const user = db.getUser(telegramId);
  if (!user) {
    await ctx.reply(`❌ Пользователь ${telegramId} не найден`);
    return;
  }
  
  db.banUser(telegramId, false);
  await ctx.reply(`✅ Пользователь ${user.username || telegramId} разблокирован`);
});

bot.command('admin_broadcast', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const text = ctx.message.text.replace('/admin_broadcast', '').trim();
  if (!text) {
    await ctx.reply('📖 Использование: /admin_broadcast <текст>');
    return;
  }
  
  const users = db.getAllUsers();
  let sent = 0;
  let failed = 0;
  
  for (const user of users) {
    if (user.is_banned === 1) continue;
    try {
      await ctx.telegram.sendMessage(user.telegram_id, `📢 ${text}`);
      sent++;
      await new Promise(r => setTimeout(r, 0.05));
    } catch (e) {
      failed++;
    }
  }
  
  await ctx.reply(`✅ Рассылка отправлена: ${sent} ✓ | ${failed} ✗`);
});

bot.command('admin_stats', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const users = db.getAllUsers();
  const now = Math.floor(Date.now() / 1000);
  const farms = farmManager.getAllFarmsStatus();
  
  const totalHours = users.reduce((sum, u) => {
    const accs = db.getSteamAccounts(u.telegram_id);
    return sum + accs.reduce((s, a) => s + (a.total_hours_farmed || 0), 0);
  }, 0);
  
  const totalGames = users.reduce((sum, u) => {
    const accs = db.getSteamAccounts(u.telegram_id);
    return sum + accs.reduce((s, a) => s + db.getGames(a.id).length, 0);
  }, 0);
  
  let text = `📊 Статистика бота\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `👥 Пользователей: ${users.length}\n`;
  text += `📡 Активных фармов: ${farms.length}\n`;
  text += `⏱ Всего часов: ${totalHours.toFixed(1)}ч\n`;
  text += `🎮 Игр в фарме: ${totalGames}\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  
  const tier1 = users.filter(u => u.premium_tier === 1 && u.premium_expires_at > now).length;
  const tier2 = users.filter(u => u.premium_tier === 2 && u.premium_expires_at > now).length;
  text += `📦 Базовый: ${tier1}\n`;
  text += `⭐ Полный: ${tier2}\n`;
  text += `🎁 Триал: ${users.filter(u => u.trial_ends_at && u.trial_ends_at > now && u.premium_expires_at <= now).length}`;
  
  await ctx.reply(text);
});

bot.command('apay_list', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const payments = db.getPendingPayments();
  if (payments.length === 0) {
    await ctx.reply('✅ Нет ожидающих платежей');
    return;
  }
  
  let text = `💳 Ожидающие платежи (${payments.length})\n━━━━━━━━━━━━━━━\n`;
  
  for (const p of payments) {
    const user = db.getUser(p.user_id);
    const tierLabel = p.tier === 2 ? '⭐ Полный' : '📦 Базовый';
    const methodLabel = p.method === 'crypto' ? '🔗 Крипта' : p.method === 'direct' ? '💳 Карта' : '⏳ Другое';
    text += `#${p.id} | ${tierLabel} | ${methodLabel}\n`;
    text += `👤 ${user?.username || p.user_id}\n`;
    text += `💰 ${p.amount}\n`;
    text += `/apay_view_${p.id} | /apay_approve ${p.user_id} | /apay_reject ${p.user_id}\n\n`;
  }
  
  await ctx.reply(text);
});

bot.command('apay_approve', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    await ctx.reply('📖 Использование: /apay_approve <telegram_id>');
    return;
  }
  
  const userId = parseInt(args[0]);
  const user = db.getUser(userId);
  if (!user) {
    await ctx.reply('❌ Пользователь не найден');
    return;
  }
  
  const pending = db.getUserPendingPayments(userId);
  if (pending.length === 0) {
    await ctx.reply('❌ Нет ожидающих платежей от этого пользователя');
    return;
  }
  
  const payment = pending[0];
  db.approvePayment(payment.id);
  db.setUserPremium(userId, payment.tier, 30);
  
  const tierLabel = payment.tier === 2 ? '⭐ Полный' : '📦 Базовый';
  
  await ctx.reply(`✅ Premium активирован!\n👤 ${user.username || userId}\n📦 ${tierLabel}\n💰 ${payment.amount}`);
  
  try {
    await ctx.telegram.sendMessage(userId, `🎉 Ваш платёж подтверждён!\n━━━━━━━━━━━━━━━\n📦 Premium: ${tierLabel}\n💰 Оплачено: ${payment.amount}\n━━━━━━━━━━━━━━━\n✅ Premium активирован на 30 дней!\n📝 Дни прибавлены к вашему остатку.`);
  } catch (e) {}
});

bot.command('apay_reject', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    await ctx.reply('📖 Использование: /apay_reject <telegram_id> [причина]');
    return;
  }
  
  const userId = parseInt(args[0]);
  const reason = args.slice(1).join(' ') || 'Платёж не подтверждён';
  const user = db.getUser(userId);
  
  const pending = db.getUserPendingPayments(userId);
  if (pending.length > 0) {
    db.rejectPayment(pending[0].id, reason);
  }
  
  await ctx.reply(`❌ Платёж отклонён для ${user?.username || userId}`);
  
  try {
    await ctx.telegram.sendMessage(userId, `⚠️ Ваш платёж отклонён.\n━━━━━━━━━━━━━━━\n📋 Причина: ${reason}\n━━━━━━━━━━━━━━━\n💡 Если это ошибка — обратитесь к администратору.`);
  } catch (e) {}
});

bot.command('apay_view', async (ctx) => {
  if (!ctx.isAdmin) return;
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    await ctx.reply('📖 Использование: /apay_view <payment_id>');
    return;
  }
  
  const paymentId = parseInt(args[0]);
  const payment = db.getPendingPayment(paymentId);
  if (!payment) {
    await ctx.reply('❌ Платёж не найден');
    return;
  }
  
  const user = db.getUser(payment.user_id);
  const tierLabel = payment.tier === 2 ? '⭐ Полный' : '📦 Базовый';
  const methodLabel = payment.method === 'crypto' ? '🔗 Криптовалюта' : payment.method === 'direct' ? '💳 Прямой перевод' : '⏳ Другой';
  const date = new Date(payment.created_at * 1000).toLocaleString('ru');
  
  let text = `💳 Платёж #${paymentId}\n━━━━━━━━━━━━━━━\n`;
  text += `👤 ${user?.username || '—'} [${payment.user_id}]\n`;
  text += `📦 Тариф: ${tierLabel}\n`;
  text += `💰 Сумма: ${payment.amount}\n`;
  text += `📋 Способ: ${methodLabel}\n`;
  text += `📅 Дата: ${date}\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `/apay_approve ${payment.user_id} — подтвердить\n/apay_reject ${payment.user_id} [причина] — отклонить`;
  
  if (payment.proof_file_id) {
    try {
      if (payment.method === 'crypto' || payment.method === 'direct') {
        await ctx.replyWithDocument(payment.proof_file_id, { caption: text });
      } else {
        await ctx.replyWithPhoto(payment.proof_file_id, { caption: text });
      }
    } catch (e) {
      await ctx.reply(text + '\n\n⚠️ Не удалось отправить файл');
    }
  } else {
    await ctx.reply(text);
  }
});
