import bot, { ADMIN_IDS, BOT_USERNAME } from '../bot.js';
import * as db from '../database.js';
import * as farmManager from '../services/farmManager.js';
import * as steamLibrary from '../services/steamLibrary.js';
import * as formatter from '../services/formatter.js';
import { userStates } from '../utils.js';

export function setupHandlers() {
  // ===== TERMS OF SERVICE =====
  
  bot.action('accept_terms', async (ctx) => {
    await ctx.answerCbQuery();
    
    db.acceptTerms(ctx.from.id);
    
    await ctx.editMessageText(
      '✅ Спасибо за принятие условий!\n\n' +
      '👋 Добро пожаловать в @SteamFarmWatchRobot — лучший инструмент для автоматического фарма часов в Steam.\n\n' +
      'Хочешь красивый профиль с тысячами часов в любимых играх, но не хочешь держать ПК включенным? Оставь это мне!\n\n' +
      'Что я умею:\n\n' +
      '⏱ Фарм 24/7: Работаю на удаленных серверах, твой компьютер может отдыхать.\n' +
      '🛡 Абсолютная безопасность: Мой алгоритм имитирует обычный запуск игр. Никаких рисков получить VAC-бан.\n' +
      '🎮 Мульти-запуск: Фармь часы в нескольких играх одновременно (до 30 игр на один аккаунт).\n' +
      '📱 Полный контроль: Запускай, останавливай и проверяй статус фарма прямо здесь, в Telegram.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }],
            [{ text: '👤 Профиль', callback_data: 'profile' }],
            [{ text: '🎁 Реферальная система', callback_data: 'referral' }]
          ]
        }
      }
    );
  });
  
  bot.action('decline_terms', async (ctx) => {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      '❌ Вы отказались от условий использования\n\n' +
      'К сожалению, без принятия условий вы не можете использовать бота.\n\n' +
      'Если передумаете, нажмите /start снова.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Начать заново', callback_data: 'restart_bot' }]
          ]
        }
      }
    );
  });
  
  bot.action('restart_bot', async (ctx) => {
    await ctx.answerCbQuery();
    
    // Показываем условия снова
    await ctx.editMessageText(
      '📜 Условия использования\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '⚠️ ВАЖНАЯ ИНФОРМАЦИЯ:\n\n' +
      '1️⃣ Безопасность:\n' +
      '• Владелец бота НЕ имеет доступа к вашему аккаунту Steam\n' +
      '• Все данные хранятся локально и зашифрованы\n' +
      '• Мы НЕ можем украсть ваш аккаунт или предметы\n\n' +
      '2️⃣ Ответственность:\n' +
      '• Вы используете бот на свой риск\n' +
      '• Владелец бота не несет ответственности за блокировки Steam\n' +
      '• Фарм часов не нарушает правила Steam, но используйте с осторожностью\n\n' +
      '3️⃣ Конфиденциальность:\n' +
      '• Ваши данные не передаются третьим лицам\n' +
      '• Refresh токены хранятся в зашифрованном виде\n' +
      '• Мы не собираем личную информацию\n\n' +
      '4️⃣ Использование:\n' +
      '• Бот работает 24/7 на защищенных серверах\n' +
      '• Вы можете остановить фарм в любой момент\n' +
      '• Вы можете удалить аккаунт из бота в любое время\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n' +
      '✅ Нажимая "Принимаю", вы подтверждаете, что:\n' +
      '• Прочитали и поняли условия\n' +
      '• Используете бот на свой риск\n' +
      '• Согласны с политикой конфиденциальности',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Принимаю условия', callback_data: 'accept_terms' }],
            [{ text: '❌ Отказаться', callback_data: 'decline_terms' }]
          ]
        }
      }
    );
  });

  // ===== ACCOUNT MANAGEMENT =====

  bot.action('accounts', async (ctx) => {
    console.log(`[ACTION] Пользователь ${ctx.from.id} нажал "Мои аккаунты"`);
    await ctx.answerCbQuery();
    
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
    const subLabel = info.isPremium ? '⭐ Premium' : limit === 0 ? '❌ Без подписки' : '🎁 Триал';
    const header = `📋 Steam аккаунты\n━━━━━━━━━━━━━━━\n${subLabel} | Аккаунтов: ${limitText}\n`;

    await ctx.editMessageText(header, {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      '👋 Главное меню\n\n' +
      'Выберите действие:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }],
            [{ text: '👤 Профиль', callback_data: 'profile' }],
            [{ text: '🎁 Реферальная система', callback_data: 'referral' }]
          ]
        }
      }
    );
  });

  bot.action('profile', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = db.getUser(ctx.from.id);
    const accounts = db.getSteamAccounts(ctx.from.id);
    const text = formatter.formatUserProfileFull(user, accounts);
    
    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💎 Подписка', callback_data: 'subscribe' }],
          [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
        ]
      }
    });
  });

  bot.action('referral', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = db.getUser(ctx.from.id);
    const referrals = db.getReferrals(ctx.from.id);
    
    let text = `🎁 Реферальная система\n`;
    text += `━━━━━━━━━━━━━━━\n\n`;
    text += `Приглашайте друзей и получайте бонусы!\n\n`;
    text += `🔗 Ваша реферальная ссылка:\n`;
    text += `https://t.me/${BOT_USERNAME}?start=ref${ctx.from.id}\n\n`;
    text += `👥 Приглашено: ${referrals.length}\n`;
    text += `💰 Заработано: ${user.referral_earnings || 0}₽\n\n`;
    text += `💡 За каждого приглашенного друга, который купит подписку, вы получите 10% от суммы!`;
    
    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
        ]
      }
    });
  });

  bot.action(/^account_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    await ctx.answerCbQuery();

    const games = db.getGames(accountId);
    const text = formatter.formatAccountInfo(account, games);

    const buttons = [];

    if (account.is_farming) {
      buttons.push([{ text: '⏸ Остановить фарм', callback_data: `stop_${accountId}` }]);
    } else {
      buttons.push([{ text: '▶️ Запустить фарм', callback_data: `start_${accountId}` }]);
    }

    buttons.push([{ text: '🎮 Настроить игры', callback_data: `games_${accountId}` }]);
    buttons.push([
      { text: '📊 Статистика', callback_data: `stats_${accountId}` },
      { text: '🎯 Цели', callback_data: `goals_${accountId}` }
    ]);
    buttons.push([
      { text: '⏰ Расписание', callback_data: `schedule_${accountId}` },
      { text: '💬 Статус', callback_data: `change_status_${accountId}` }
    ]);
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

  bot.action(/^games_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    console.log(`[ACTION] Пользователь ${ctx.from.id} нажал "Настроить игры" для аккаунта ${accountId}`);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    await ctx.answerCbQuery();

    const games = db.getGames(accountId);
    const maxGames = db.getGamesLimit(account.user_id);

    let text = `🎮 Игры для ${account.account_name}\n\n`;
    text += formatter.formatGamesList(games);
    text += `\nВсего: ${games.length}/${maxGames}`;

    const buttons = [
      [{ text: '📚 Выбрать из библиотеки', callback_data: `library_${accountId}` }],
      [{ text: '➕ Добавить игру по ID', callback_data: `add_game_${accountId}` }],
      [{ text: '⏱ Выбрать по часам', callback_data: `by_hours_${accountId}` }]
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

  bot.action(/^by_hours_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    console.log(`[ACTION] Пользователь ${ctx.from.id} нажал "Выбрать по часам" для аккаунта ${accountId}`);
    
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      console.log(`[ERROR] Пользователь ${ctx.from.id} пытается получить доступ к чужому аккаунту ${accountId}`);
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    await ctx.answerCbQuery();

    // Получаем кеш
    const { readGameCache, getSteamId64FromAccount } = await import('../services/gameCache.js');
    const steamId64 = getSteamId64FromAccount(account);
    const cache = readGameCache(steamId64);
    
    // Если кеша нет - просим загрузить библиотеку
    if (!cache || !cache.topPlayed || cache.topPlayed.length === 0) {
      await ctx.editMessageText('❌ Нет данных об играх с часами\n\nСначала загрузите библиотеку нажав на "📚 Выбрать из библиотеки"', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📚 Выбрать из библиотеки', callback_data: `library_${accountId}` }],
            [{ text: '🔙 Назад', callback_data: `games_${accountId}` }]
          ]
        }
      });
      return;
    }

    // Получаем выбранные игры
    const selectedGames = db.getGames(accountId);
    const selectedAppIds = new Set(selectedGames.map(g => g.app_id));

    // Используем данные из кеша - ВСЕ игры с часами
    const allGames = cache.topPlayed || [];
    
    // Фильтруем только игры с часами > 0
    const gamesWithHours = allGames.filter(g => g.playtime_forever > 0);
    
    if (gamesWithHours.length === 0) {
      await ctx.editMessageText('❌ Нет игр с наигранными часами\n\nСначала загрузите библиотеку нажав на "📚 Выбрать из библиотеки"', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📚 Выбрать из библиотеки', callback_data: `library_${accountId}` }],
            [{ text: '🔙 Назад', callback_data: `games_${accountId}` }]
          ]
        }
      });
      return;
    }
    
    // Берем только ТОП-10 по часам
    const top10Games = gamesWithHours.slice(0, 10);
    
    const buttons = top10Games.map(game => {
      const hours = Math.floor(game.playtime_forever / 60);
      const mins = game.playtime_forever % 60;
      const timeStr = hours > 0 ? `${hours}ч ${mins}мин` : `${mins}мин`;
      const isSelected = selectedAppIds.has(game.appId);
      return [{
        text: `${isSelected ? '✅ ' : ''}${game.name} (${timeStr})`,
        callback_data: `toggle_by_hours_${accountId}_${game.appId}`
      }];
    });
    
    buttons.push([{ text: '✅ Готово', callback_data: `games_${accountId}` }]);
    buttons.push([{ text: '🔙 Назад', callback_data: `games_${accountId}` }]);

    const selectedFromTop10 = selectedGames.filter(g => top10Games.find(t => t.appId === g.app_id)).length;
    await ctx.editMessageText(`🏆 Топ-10 игр по часам\n\nВыбрано: ${selectedFromTop10}/10\n\nНажмите на игру чтобы добавить/удалить:`, {
      reply_markup: { inline_keyboard: buttons }
    });
    console.log(`[SUCCESS] Показал топ-10 игр по часам из кеша для аккаунта ${accountId}`);
  });

  bot.action(/^toggle_by_hours_(\d+)_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const appId = parseInt(ctx.match[2]);
    
    const account = db.getSteamAccount(accountId);
    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    const games = db.getGames(accountId);
    const existingGame = games.find(g => g.app_id === appId);
    
    if (existingGame) {
      // Удаляем игру
      db.removeGame(accountId, appId);
      await ctx.answerCbQuery('➖ Игра удалена');
    } else {
      // Проверяем лимит
      const maxGames = db.getGamesLimit(account.user_id);
      if (games.length >= maxGames) {
        await ctx.answerCbQuery(`❌ Достигнут лимит игр (${maxGames})`, { show_alert: true });
        return;
      }
      
      // Добавляем игру - получаем название из кеша
      try {
        const { readGameCache, getSteamId64FromAccount } = await import('../services/gameCache.js');
        const steamId64 = getSteamId64FromAccount(account);
        const cache = readGameCache(steamId64);
        
        let gameName = `App ${appId}`;
        
        if (cache && cache.topPlayed) {
          const gameFromCache = cache.topPlayed.find(g => g.appId === appId);
          if (gameFromCache) {
            gameName = gameFromCache.name;
          }
        }
        
        const result = db.addGame(accountId, appId, gameName);
        
        if (result === null) {
          await ctx.answerCbQuery('⚠️ Игра уже добавлена');
          // Обновляем список без добавления
          ctx.callbackQuery.data = `by_hours_${accountId}`;
          await bot.handleUpdate({ callback_query: ctx.callbackQuery });
          return;
        }
        
        await ctx.answerCbQuery('✅ Игра добавлена');
      } catch (err) {
        console.error('Ошибка добавления игры:', err);
        await ctx.answerCbQuery('❌ Ошибка добавления игры');
        return;
      }
    }
    
    // Перезапускаем фарм если активен
    if (account.is_farming) {
      try {
        await farmManager.restartFarming(accountId);
      } catch (err) {
        console.error('Ошибка перезапуска:', err);
      }
    }
    
    // Обновляем список - вызываем тот же обработчик
    ctx.callbackQuery.data = `by_hours_${accountId}`;
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

    await ctx.answerCbQuery();

    try {
      // Показываем сообщение о загрузке
      if (forceRefresh || page === 0) {
        await ctx.editMessageText('⏳ Загружаю библиотеку и часы игр...\n\nЭто может занять до минуты.');
      }
      
      // Парсим библиотеку + часы
      const library = await steamLibrary.getOwnedGamesWithHours(accountId, forceRefresh);
      const pageGames = library.slice(page * 15, page * 15 + 15);
      const totalPages = Math.ceil(library.length / 15);

      // Получаем выбранные игры для отображения галочек
      const selectedGames = db.getGames(accountId);
      const selectedAppIds = new Set(selectedGames.map(g => g.app_id));
      
      // Вычисляем лимит игр
      const maxGames = db.getGamesLimit(account.user_id);
      
      let text = `📚 Библиотека игр для ${account.account_name}\n\n`;
      text += `Всего: ${library.length} игр\n`;
      text += `Выбрано: ${selectedGames.length}/${maxGames}\n`;
      text += `Страница: ${page + 1}/${totalPages}\n`;

      const gameButtons = pageGames.map(game => {
        let displayText = game.name;
        
        // Добавляем галочку если игра выбрана
        const isSelected = selectedAppIds.has(game.appId);
        if (isSelected) {
          displayText = '✅ ' + displayText;
        }
        
        // Добавляем часы если есть
        if (game.playtime_forever > 0) {
          const hours = Math.floor(game.playtime_forever / 60);
          const mins = game.playtime_forever % 60;
          const timeStr = hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;
          displayText += ` (${timeStr})`;
        }
        
        return [{
          text: displayText,
          callback_data: `add_library_${accountId}_${game.appId}`
        }];
      });

      const navButtons = [];
      if (page > 0) {
        navButtons.push({ text: '◀️ Назад', callback_data: `library_${accountId}_page_${page - 1}` });
      }
      if (page < totalPages - 1) {
        navButtons.push({ text: 'Вперед ▶️', callback_data: `library_${accountId}_page_${page + 1}` });
      }

      if (navButtons.length > 0) {
        gameButtons.push(navButtons);
      }

      gameButtons.push([
        { text: '🔄 Обновить', callback_data: `library_${accountId}_refresh` }
      ]);
      gameButtons.push([{ text: '🔙 Назад', callback_data: `games_${accountId}` }]);

      await ctx.editMessageText(text, {
        reply_markup: { inline_keyboard: gameButtons }
      });
    } catch (error) {
      console.error('Ошибка загрузки библиотеки:', error.message);
      await ctx.editMessageText(`❌ Ошибка: ${error.message}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Повторить', callback_data: `library_${accountId}_refresh` }],
            [{ text: '🔙 Назад', callback_data: `games_${accountId}` }]
          ]
        }
      });
    }
  });

  bot.action(/^add_library_(\d+)_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const appId = parseInt(ctx.match[2]);
    
    const account = db.getSteamAccount(accountId);
    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    const games = db.getGames(accountId);
    const existingGame = games.find(g => g.app_id === appId);
    
    // Если игра уже добавлена - удаляем её
    if (existingGame) {
      db.removeGame(accountId, appId);
      await ctx.answerCbQuery('✅ Игра удалена');
      
      if (account.is_farming) {
        try {
          await farmManager.restartFarming(accountId);
        } catch (err) {
          console.error('Ошибка перезапуска:', err);
        }
      }
      
      // Обновляем только кнопки, не перезагружая библиотеку
      await updateLibraryButtons(ctx, accountId);
      return;
    }
    
    // Проверяем лимит
    const maxGames = db.getGamesLimit(account.user_id);
    if (games.length >= maxGames) {
      await ctx.answerCbQuery(`❌ Достигнут лимит игр (${maxGames})`, { show_alert: true });
      return;
    }

    await ctx.answerCbQuery('⏳ Добавляю игру...');

    // Получаем название игры из кеша
    const library = await steamLibrary.getOwnedGamesWithHours(accountId, false);
    const gameInfo = library.find(g => g.appId === appId);
    const gameName = gameInfo?.name || `App ${appId}`;

    const result = db.addGame(accountId, appId, gameName);
    
    if (result === null) {
      await ctx.answerCbQuery('⚠️ Игра уже добавлена');
    } else {
      await ctx.answerCbQuery(`✅ ${gameName} добавлена`);
      
      if (account.is_farming) {
        try {
          await farmManager.restartFarming(accountId);
        } catch (err) {
          console.error('Ошибка перезапуска:', err);
        }
      }
    }
    
    // Обновляем только кнопки, не перезагружая библиотеку
    await updateLibraryButtons(ctx, accountId);
  });

  // Вспомогательная функция для обновления кнопок без перезагрузки
  async function updateLibraryButtons(ctx, accountId) {
    try {
      const account = db.getSteamAccount(accountId);
      const library = await steamLibrary.getOwnedGamesWithHours(accountId, false);
      
      // Получаем текущую страницу из сообщения
      const currentText = ctx.callbackQuery.message.text;
      const pageMatch = currentText.match(/Страница: (\d+)\/(\d+)/);
      const page = pageMatch ? parseInt(pageMatch[1]) - 1 : 0;
      
      const pageGames = library.slice(page * 15, page * 15 + 15);
      const totalPages = Math.ceil(library.length / 15);

      const selectedGames = db.getGames(accountId);
      const selectedAppIds = new Set(selectedGames.map(g => g.app_id));
      
      const maxGames = db.getGamesLimit(account.user_id);
      
      let text = `📚 Библиотека игр для ${account.account_name}\n\n`;
      text += `Всего: ${library.length} игр\n`;
      text += `Выбрано: ${selectedGames.length}/${maxGames}\n`;
      text += `Страница: ${page + 1}/${totalPages}\n`;

      const gameButtons = pageGames.map(game => {
        let displayText = game.name;
        
        const isSelected = selectedAppIds.has(game.appId);
        if (isSelected) {
          displayText = '✅ ' + displayText;
        }
        
        if (game.playtime_forever > 0) {
          const hours = Math.floor(game.playtime_forever / 60);
          const mins = game.playtime_forever % 60;
          const timeStr = hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;
          displayText += ` (${timeStr})`;
        }
        
        return [{
          text: displayText,
          callback_data: `add_library_${accountId}_${game.appId}`
        }];
      });

      const navButtons = [];
      if (page > 0) {
        navButtons.push({ text: '◀️ Назад', callback_data: `library_${accountId}_page_${page - 1}` });
      }
      if (page < totalPages - 1) {
        navButtons.push({ text: 'Вперед ▶️', callback_data: `library_${accountId}_page_${page + 1}` });
      }

      if (navButtons.length > 0) {
        gameButtons.push(navButtons);
      }

      gameButtons.push([
        { text: '🔄 Обновить', callback_data: `library_${accountId}_refresh` }
      ]);
      gameButtons.push([{ text: '🔙 Назад', callback_data: `games_${accountId}` }]);

      await ctx.editMessageText(text, {
        reply_markup: { inline_keyboard: gameButtons }
      });
    } catch (error) {
      console.error('Ошибка обновления кнопок:', error.message);
    }
  }

  bot.action(/^add_game_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    
    await ctx.answerCbQuery();
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

  bot.action(/^start_(\d+)$/, async (ctx) => {
    console.log(`[ACTION] Пользователь ${ctx.from.id} нажал "Запустить фарм" для аккаунта ${ctx.match[1]}`);
    const accountId = parseInt(ctx.match[1]);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    const games = db.getGames(accountId);
    if (games.length === 0) {
      await ctx.answerCbQuery('❌ Добавьте хотя бы одну игру для фарма', { show_alert: true });
      return;
    }

    if (farmManager.isFarming(accountId)) {
      await ctx.answerCbQuery('⚠️ Фарм уже запущен', { show_alert: true });
      return;
    }

    try {
      await farmManager.startFarming(accountId);
      await ctx.answerCbQuery('✅ Фарм запущен', { show_alert: true });
      
      // Ждем 2 секунды чтобы фарм успел запуститься и обновить статус в БД
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Обновляем сообщение с деталями аккаунта
      const acc = db.getSteamAccount(accountId);
      const updatedGames = db.getGames(accountId);
      const text = formatter.formatAccountInfo(acc, updatedGames);

      const buttons = [];
      
      if (acc.is_farming) {
        buttons.push([{ text: '⏸ Остановить фарм', callback_data: `stop_${accountId}` }]);
      } else {
        buttons.push([{ text: '▶️ Запустить фарм', callback_data: `start_${accountId}` }]);
      }
      
      buttons.push([{ text: '🎮 Настроить игры', callback_data: `games_${accountId}` }]);
      buttons.push([
        { text: '📊 Статистика', callback_data: `stats_${accountId}` },
        { text: '🎯 Цели', callback_data: `goals_${accountId}` }
      ]);
      buttons.push([
        { text: '⏰ Расписание', callback_data: `schedule_${accountId}` },
        { text: '💬 Статус', callback_data: `change_status_${accountId}` }
      ]);
      buttons.push([{ text: '👁 Видимость', callback_data: `visibility_${accountId}` }]);
      if (acc.has_parental_control) {
        buttons.push([{ text: '🔐 PIN родительского контроля', callback_data: `set_pin_${accountId}` }]);
      }
      buttons.push([{ text: '🗑 Удалить аккаунт', callback_data: `delete_${accountId}` }]);
      buttons.push([{ text: '🔙 К списку аккаунтов', callback_data: 'accounts' }]);

      await ctx.editMessageText(text, {
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (error) {
      console.error(`❌ Ошибка запуска фарма для аккаунта ${accountId}:`, error.message);
      await ctx.answerCbQuery(`❌ Ошибка: ${error.message}`, { show_alert: true });
    }
  });

  bot.action(/^stop_(\d+)$/, async (ctx) => {
    console.log(`[ACTION] Пользователь ${ctx.from.id} нажал "Остановить фарм" для аккаунта ${ctx.match[1]}`);
    const accountId = parseInt(ctx.match[1]);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    if (!farmManager.isFarming(accountId)) {
      await ctx.answerCbQuery('⚠️ Фарм не запущен', { show_alert: true });
      return;
    }

    try {
      await farmManager.stopFarming(accountId);
      await ctx.answerCbQuery('✅ Фарм остановлен', { show_alert: true });
      
      // Ждем 1 секунду чтобы фарм успел остановиться и обновить статус в БД
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Обновляем сообщение с деталями аккаунта
      const acc = db.getSteamAccount(accountId);
      const updatedGames = db.getGames(accountId);
      const text = formatter.formatAccountInfo(acc, updatedGames);

      const buttons = [];
      
      if (acc.is_farming) {
        buttons.push([{ text: '⏸ Остановить фарм', callback_data: `stop_${accountId}` }]);
      } else {
        buttons.push([{ text: '▶️ Запустить фарм', callback_data: `start_${accountId}` }]);
      }
      
      buttons.push([{ text: '🎮 Настроить игры', callback_data: `games_${accountId}` }]);
      buttons.push([
        { text: '📊 Статистика', callback_data: `stats_${accountId}` },
        { text: '🎯 Цели', callback_data: `goals_${accountId}` }
      ]);
      buttons.push([
        { text: '⏰ Расписание', callback_data: `schedule_${accountId}` },
        { text: '💬 Статус', callback_data: `change_status_${accountId}` }
      ]);
      buttons.push([{ text: '👁 Видимость', callback_data: `visibility_${accountId}` }]);
      if (acc.has_parental_control) {
        buttons.push([{ text: '🔐 PIN родительского контроля', callback_data: `set_pin_${accountId}` }]);
      }
      buttons.push([{ text: '🗑 Удалить аккаунт', callback_data: `delete_${accountId}` }]);
      buttons.push([{ text: '🔙 К списку аккаунтов', callback_data: 'accounts' }]);

      await ctx.editMessageText(text, {
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (error) {
      console.error(`❌ Ошибка остановки фарма для аккаунта ${accountId}:`, error.message);
      await ctx.answerCbQuery(`❌ Ошибка: ${error.message}`, { show_alert: true });
    }
  });

  bot.action(/^change_status_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    userStates.set(ctx.from.id, { action: 'change_status', accountId });

    const currentStatus = db.getCustomStatus(accountId);
    const statusText = currentStatus ? `Текущий статус: "${currentStatus}"` : 'Статус не установлен';

    await ctx.editMessageText(
      `💬 Введите новый статус для ${account.account_name}\n\n` +
      `${statusText}\n\n` +
      `Используется для отображения первой игры в Steam (например: "Grand Theft Auto VI")\n` +
      `Максимум 100 символов.`,
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

  bot.action(/^clear_games_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    const games = db.getGames(accountId);
    if (games.length === 0) {
      await ctx.answerCbQuery('❌ Список игр пуст', { show_alert: true });
      return;
    }

    const deletedCount = db.clearGames(accountId);
    await ctx.answerCbQuery(`🗑 Удалено игр: ${deletedCount.changes}`, { show_alert: true });

    // Если фарм активен - перезапустим
    if (account.is_farming) {
      try {
        await farmManager.restartFarming(accountId);
        await ctx.reply('🔄 Фарм перезапущен (без игр)');
      } catch (err) {
        console.error('Ошибка перезапуска:', err);
      }
    }

    // Обновляем сообщение с играми
    const acc = db.getSteamAccount(accountId);
    const updatedGames = db.getGames(accountId);
    const maxGames = db.getGamesLimit(acc.user_id);
    const text = `🎮 Игры для ${acc.account_name}\n\n${formatter.formatGamesList(updatedGames)}\nВсего: ${updatedGames.length}/${maxGames}`;

    const buttons = [
      [{ text: '📚 Выбрать из библиотеки', callback_data: `library_${accountId}` }],
      [{ text: '➕ Добавить игру по ID', callback_data: `add_game_${accountId}` }],
      [{ text: '⏱ Выбрать по часам', callback_data: `by_hours_${accountId}` }],
      [{ text: '🔙 Назад', callback_data: `account_${accountId}` }]
    ];

    await ctx.editMessageText(text, {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action(/^start_all$/, async (ctx) => {
    const accounts = db.getSteamAccounts(ctx.from.id);
    const stoppedAccounts = accounts.filter(acc => !acc.is_farming);

    if (stoppedAccounts.length === 0) {
      await ctx.answerCbQuery('❌ Нет аккаунтов для запуска', { show_alert: true });
      return;
    }

    let successCount = 0;
    for (const account of stoppedAccounts) {
      try {
        const games = db.getGames(account.id);
        if (games.length > 0) {
          await farmManager.startFarming(account.id);
          successCount++;
        }
      } catch (error) {
        console.error(`❌ Ошибка запуска фарма для аккаунта ${account.id}:`, error.message);
      }
    }

    await ctx.answerCbQuery(`✅ Запущено ${successCount} аккаунтов`, { show_alert: true });
    await bot.handleUpdate({ callback_query: ctx.callbackQuery });
  });

  bot.action(/^stop_all$/, async (ctx) => {
    const accounts = db.getSteamAccounts(ctx.from.id);
    const runningAccounts = accounts.filter(acc => acc.is_farming);

    if (runningAccounts.length === 0) {
      await ctx.answerCbQuery('❌ Нет аккаунтов для остановки', { show_alert: true });
      return;
    }

    let successCount = 0;
    for (const account of runningAccounts) {
      try {
        await farmManager.stopFarming(account.id);
        successCount++;
      } catch (error) {
        console.error(`❌ Ошибка остановки фарма для аккаунта ${account.id}:`, error.message);
      }
    }

    await ctx.answerCbQuery(`✅ Остановлено ${successCount} аккаунтов`, { show_alert: true });
    await bot.handleUpdate({ callback_query: ctx.callbackQuery });
  });

  bot.action('add_account', async (ctx) => {
    await ctx.answerCbQuery();

    await ctx.editMessageText(
      '🔗 Добавить Steam аккаунт\n\n' +
      'Выберите способ добавления:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔑 Логин и пароль', callback_data: 'add_account_credentials' }],
            [{ text: '📱 QR-код', callback_data: 'add_account_qr' }],
            [{ text: '❌ Отмена', callback_data: 'accounts' }]
          ]
        }
      }
    );
  });

  bot.action('add_account_qr', async (ctx) => {
    await ctx.answerCbQuery();
    
    try {
      const { createQRAuth, waitForQRConfirmation } = await import('../services/steamAuth.js');
      
      // Создаем QR-код
      const qrBuffer = await createQRAuth(ctx.from.id);
      
      // Отправляем QR-код
      await ctx.replyWithPhoto({ source: qrBuffer }, {
        caption: '📱 Отсканируйте QR-код в приложении Steam\n\n' +
          '1. Откройте приложение Steam на телефоне\n' +
          '2. Нажмите на меню (☰)\n' +
          '3. Выберите "Войти с помощью QR-кода"\n' +
          '4. Отсканируйте этот QR-код\n\n' +
          '⏱ Ожидание... (2 минуты)',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'cancel_auth' }]
          ]
        }
      });
      
      // Ждем подтверждения
      const result = await waitForQRConfirmation(ctx.from.id);
      
      await ctx.reply(
        `✅ Аккаунт добавлен!\n\n` +
        `👤 ${result.accountName}\n\n` +
        `Теперь вы можете добавить игры и запустить фарм.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Добавить игры', callback_data: `games_${result.accountId}` }],
              [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('QR Auth error:', error);
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  });

  bot.action('add_account_credentials', async (ctx) => {
    await ctx.answerCbQuery();
    userStates.set(ctx.from.id, { action: 'add_account_credentials_step1' });

    await ctx.editMessageText(
      '🔑 Вход через логин и пароль\n\n' +
      '📝 Отправьте логин от Steam аккаунта:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'add_account' }]
          ]
        }
      }
    );
  });

  bot.action('cancel_auth', async (ctx) => {
    await ctx.answerCbQuery();
    
    const { cancelAuth } = await import('../services/steamAuth.js');
    cancelAuth(ctx.from.id);
    userStates.delete(ctx.from.id);
    
    await ctx.reply('❌ Авторизация отменена', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }]
        ]
      }
    });
  });

  bot.action(/^delete_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    if (account.is_farming) {
      await ctx.answerCbQuery('❌ Остановите фарм перед удалением', { show_alert: true });
      return;
    }

    db.deleteSteamAccount(accountId);
    await ctx.answerCbQuery('🗑 Аккаунт удален', { show_alert: true });

    // Обновляем список аккаунтов
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

  // ===== PAYMENT SYSTEM =====

  bot.action(/^pay_select_(\d)$/, async (ctx) => {
    const tier = parseInt(ctx.match[1]);
    const price = tier === 2 ? '100₽' : '50₽';
    const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
    
    await ctx.editMessageText(
      `💳 Платёжная система\n━━━━━━━━━━━━━━━\nТариф: ${tierLabel}\nЦена: ${price}\n━━━━━━━━━━━━━━━\n\n` +
      `Выберите способ оплаты:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⭐ Звёзды', callback_data: `pay_stars_${tier}` }],
            [{ text: '🔗 Криптобот', callback_data: `pay_crypto_${tier}` }],
            [{ text: '💳 Перевод', callback_data: `pay_transfer_${tier}` }],
            [{ text: '🔙 Назад', callback_data: 'buy_premium' }]
          ]
        }
      }
    );
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
    const price = tier === 2 ? '100₽' : '50₽';
    const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
    
    try {
      const invoice = await import('../services/cryptoPayment.js').then(m => m.createCryptoInvoice(tier, ctx.from.id));
      
      userStates.set(ctx.from.id, { action: 'await_crypto_payment', tier, invoiceId: invoice.invoice_id });
      
      const text = `🔗 Криптобот\n━━━━━━━━━━━━━━━\nТариф: ${tierLabel} — ${price}\n━━━━━━━━━━━━━━━\n\n` +
        `💰 К оплате: ${invoice.amount} USDT\n` +
        `⏰ Счёт действителен 15 минут\n\n` +
        `Оплатите счёт по ссылке выше. После оплаты нажмите "Проверить оплату".`;
      
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
      console.error('Crypto payment error:', err.message);
      await ctx.answerCbQuery('❌ Ошибка. Попробуйте позже.', { show_alert: true });
    }
  });

  bot.action(/^pay_transfer_(\d)$/, async (ctx) => {
    const tier = parseInt(ctx.match[1]);
    const price = tier === 2 ? '100₽' : '50₽';
    const tierLabel = tier === 2 ? '⭐ Полный' : '📦 Базовый';
    
    await ctx.editMessageText(
      `💳 Ручной перевод\n━━━━━━━━━━━━━━━\nТариф: ${tierLabel}\nЦена: ${price}\n━━━━━━━━━━━━━━━\n\n` +
      `💳 Переведите ${price} на любой способ оплаты:\n\n` +
      `- Тинькофф: 5536 9141 8106 4206\n` +
      `- Сбербанк: 2202 2060 7836 8020\n` +
      `- USDT TRC20: TQowe...\n\n` +
      `📸 После перевода отправьте:\n` +
      `1. Скрин чека\n` +
      `2. Ваш Telegram ID: ${ctx.from.id}\n\n` +
      `После проверки администратор активирует Premium.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 Отправить чек', callback_data: `send_proof_${tier}` }],
            [{ text: '🔙 Назад', callback_data: `pay_select_${tier}` }]
          ]
        }
      }
    );
  });

  bot.action(/^send_proof_(\d)$/, async (ctx) => {
    const tier = parseInt(ctx.match[1]);
    userStates.set(ctx.from.id, { action: 'await_proof', tier });
    
    await ctx.answerCbQuery('📸 Отправьте скрин чека и ваш Telegram ID', { show_alert: true });
  });

  bot.action(/^crypto_check_(.+)$/, async (ctx) => {
    const invoiceId = ctx.match[1];
    const state = userStates.get(ctx.from.id);
    
    try {
      const { checkCryptoInvoice } = await import('../services/cryptoPayment.js');
      const invoice = await checkCryptoInvoice(invoiceId);
      
      if (!invoice) {
        await ctx.answerCbQuery('❌ Счёт не найден', { show_alert: true });
        return;
      }
      
      if (invoice.status === 'paid') {
        db.setUserPremium(ctx.from.id, invoice.payload?.tier || state?.tier || 1, 30);
        userStates.delete(ctx.from.id);
        
        await ctx.editMessageText(`🎉 Платёж получен!\n━━━━━━━━━━━━━━━\n💰 Оплачено: ${invoice.amount} ${invoice.asset}\n📦 Тариф: ${invoice.payload?.tier === 2 ? '⭐ Полный' : '📦 Базовый'}\n━━━━━━━━━━━━━━━\n✅ Premium активирован на 30 дней!\n📝 Дни прибавлены к остатку.\n\nСпасибо! ❤️`);
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

  // ===== ADMIN PANEL =====

  bot.command('admin', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) {
      return;
    }

    const users = db.getAllUsers();
    const accounts = db.getAllSteamAccounts();
    const activeFarms = farmManager.getActiveFarms();
    
    // Получаем использование ресурсов
    const memUsage = process.memoryUsage();
    const memUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const memTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const uptime = Math.floor(process.uptime());
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);

    const activeUsers = users.filter(u => {
      const info = db.getUserSubscriptionInfo(u.telegram_id);
      return info.isPremium || info.isTrial;
    }).length;

    let text = `👮‍♂️ Админ-панель\n━━━━━━━━━━━━━━━\n\n`;
    
    text += `📊 Статистика:\n`;
    text += `👥 Пользователей: ${users.length}\n`;
    text += `✅ Активных: ${activeUsers}\n`;
    text += `🎮 Аккаунтов: ${accounts.length}\n`;
    text += `🟢 Фармит: ${activeFarms.length}\n\n`;
    
    text += `💻 Ресурсы:\n`;
    text += `🧠 RAM: ${memUsedMB}/${memTotalMB} МБ\n`;
    text += `⏱ Uptime: ${uptimeHours}ч ${uptimeMinutes}м\n\n`;
    
    text += `📦 Подписки:\n`;
    text += `📦 Базовый: ${users.filter(u => db.getUserSubscriptionInfo(u.telegram_id).tier === 1).length}\n`;
    text += `⭐ Полный: ${users.filter(u => db.getUserSubscriptionInfo(u.telegram_id).tier === 2).length}\n`;
    text += `🎁 Триал: ${users.filter(u => db.getUserSubscriptionInfo(u.telegram_id).isTrial).length}\n`;

    await ctx.reply(text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👥 Пользователи', callback_data: 'admin_users' },
            { text: '🎮 Фарм', callback_data: 'admin_farms' }
          ],
          [
            { text: '💳 Платежи', callback_data: 'admin_payments' },
            { text: '📊 Статистика', callback_data: 'admin_stats' }
          ],
          [
            { text: '⚙️ Система', callback_data: 'admin_system' },
            { text: '📋 Логи', callback_data: 'admin_logs' }
          ]
        ]
      }
    });
  });

  bot.action('admin_payments', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    const payments = db.getPendingPayments();
    if (payments.length === 0) {
      await ctx.editMessageText('📭 Нет ожидающих платежей', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'admin_back' }]
          ]
        }
      });
      return;
    }

    let text = `💳 Ожидающие платежи\n━━━━━━━━━━━━━━━\n`;
    for (const payment of payments) {
      const user = db.getUser(payment.user_id);
      const tier = payment.tier === 2 ? '⭐ Полный' : '📦 Базовый';
      text += `ID: ${payment.id}\n`;
      text += `Пользователь: ${user?.username || user?.telegram_id} [${payment.user_id}]\n`;
      text += `Тариф: ${tier}\n`;
      text += `Сумма: ${payment.amount}\n`;
      text += `Дата: ${new Date(payment.created_at * 1000).toLocaleString('ru-RU')}\n`;
      text += `━━━━━━━━━━━━━━━\n`;
    }

    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад', callback_data: 'admin_back' }]
        ]
      }
    });
  });

  bot.action('admin_users', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    await ctx.editMessageText('👥 Управление пользователями\n━━━━━━━━━━━━━━━\n\nВведите Telegram ID пользователя:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Список всех', callback_data: 'admin_users_list' }],
          [{ text: '🔙 Назад', callback_data: 'admin_back' }]
        ]
      }
    });
  });

  bot.action('admin_users_list', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    const users = db.getAllUsers();
    const page = 0;
    const perPage = 10;
    const totalPages = Math.ceil(users.length / perPage);
    const pageUsers = users.slice(page * perPage, (page + 1) * perPage);
    
    let text = `👥 Пользователи (${page + 1}/${totalPages})\n━━━━━━━━━━━━━━━\n\n`;
    
    for (const user of pageUsers) {
      const info = db.getUserSubscriptionInfo(user.telegram_id);
      const status = info.isPremium ? '⭐' : info.isTrial ? '🎁' : '❌';
      const banned = info.isBanned ? '🚫' : '';
      text += `${status}${banned} ${user.username || 'NoName'} [${user.telegram_id}]\n`;
    }
    
    const buttons = [];
    if (totalPages > 1) {
      buttons.push([
        { text: '◀️', callback_data: `admin_users_list_${Math.max(0, page - 1)}` },
        { text: `${page + 1}/${totalPages}`, callback_data: 'noop' },
        { text: '▶️', callback_data: `admin_users_list_${Math.min(totalPages - 1, page + 1)}` }
      ]);
    }
    buttons.push([{ text: '🔙 Назад', callback_data: 'admin_users' }]);
    
    await ctx.editMessageText(text, {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.action('admin_farms', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    const activeFarms = farmManager.getAllFarmsStatus();
    
    if (activeFarms.length === 0) {
      await ctx.editMessageText('🎮 Активные фармы\n━━━━━━━━━━━━━━━\n\nНет активных фармов', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'admin_back' }]
          ]
        }
      });
      return;
    }
    
    let text = `🎮 Активные фармы (${activeFarms.length})\n━━━━━━━━━━━━━━━\n\n`;
    
    for (const farm of activeFarms.slice(0, 10)) {
      const uptimeHours = Math.floor(farm.uptime / 3600);
      const uptimeMinutes = Math.floor((farm.uptime % 3600) / 60);
      text += `🟢 ${farm.accountName}\n`;
      text += `   Игр: ${farm.gamesCount} | Uptime: ${uptimeHours}ч ${uptimeMinutes}м\n`;
      text += `   Всего: ${farm.totalHoursFarmed.toFixed(1)}ч\n\n`;
    }
    
    if (activeFarms.length > 10) {
      text += `... и еще ${activeFarms.length - 10} фармов\n`;
    }
    
    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: 'admin_farms' }],
          [{ text: '🔙 Назад', callback_data: 'admin_back' }]
        ]
      }
    });
  });

  bot.action('admin_stats', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    const users = db.getAllUsers();
    const accounts = db.getAllSteamAccounts();
    const activeFarms = farmManager.getActiveFarms();
    
    // Статистика по дням
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;
    const oneWeekAgo = now - 604800;
    
    const newUsersToday = users.filter(u => u.created_at > oneDayAgo).length;
    const newUsersWeek = users.filter(u => u.created_at > oneWeekAgo).length;
    
    // Статистика по аккаунтам
    const totalHoursFarmed = accounts.reduce((sum, acc) => sum + (acc.total_hours_farmed || 0), 0);
    
    let text = `📊 Детальная статистика\n━━━━━━━━━━━━━━━\n\n`;
    
    text += `👥 Пользователи:\n`;
    text += `Всего: ${users.length}\n`;
    text += `Новых за день: ${newUsersToday}\n`;
    text += `Новых за неделю: ${newUsersWeek}\n\n`;
    
    text += `🎮 Аккаунты:\n`;
    text += `Всего: ${accounts.length}\n`;
    text += `Активных: ${activeFarms.length}\n`;
    text += `Остановлено: ${accounts.length - activeFarms.length}\n\n`;
    
    text += `⏱ Фарм:\n`;
    text += `Всего нафармлено: ${totalHoursFarmed.toFixed(1)} часов\n`;
    text += `Среднее на аккаунт: ${(totalHoursFarmed / accounts.length || 0).toFixed(1)}ч\n`;
    
    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: 'admin_stats' }],
          [{ text: '🔙 Назад', callback_data: 'admin_back' }]
        ]
      }
    });
  });

  bot.action('admin_system', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    const memUsage = process.memoryUsage();
    const memUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const memTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const uptime = Math.floor(process.uptime());
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    
    const dbSize = db.getDatabaseSize();
    const dbSizeMB = (dbSize / 1024 / 1024).toFixed(2);
    
    let text = `⚙️ Управление системой\n━━━━━━━━━━━━━━━\n\n`;
    
    text += `💻 Система:\n`;
    text += `🧠 RAM: ${memUsedMB}/${memTotalMB} МБ\n`;
    text += `⏱ Uptime: ${uptimeHours}ч ${uptimeMinutes}м\n`;
    text += `💾 БД: ${dbSizeMB} МБ\n`;
    text += `🔢 PID: ${process.pid}\n`;
    
    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Оптимизировать БД', callback_data: 'admin_optimize_db' },
            { text: '🗑 Очистить кеш', callback_data: 'admin_clear_cache' }
          ],
          [{ text: '🔙 Назад', callback_data: 'admin_back' }]
        ]
      }
    });
  });

  bot.action('admin_optimize_db', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    await ctx.answerCbQuery('⏳ Оптимизация БД...');
    
    try {
      db.cleanupOldData();
      db.optimizeDatabase();
      await ctx.answerCbQuery('✅ БД оптимизирована', { show_alert: true });
    } catch (err) {
      await ctx.answerCbQuery('❌ Ошибка оптимизации', { show_alert: true });
    }
    
    // Обновляем информацию
    ctx.callbackQuery.data = 'admin_system';
    await bot.handleUpdate({ callback_query: ctx.callbackQuery });
  });

  bot.action('admin_clear_cache', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    await ctx.answerCbQuery('⏳ Очистка кеша...');
    
    try {
      const { cleanupOldCaches } = await import('../services/gameCache.js');
      await cleanupOldCaches();
      await ctx.answerCbQuery('✅ Кеш очищен', { show_alert: true });
    } catch (err) {
      await ctx.answerCbQuery('❌ Ошибка очистки', { show_alert: true });
    }
    
    ctx.callbackQuery.data = 'admin_system';
    await bot.handleUpdate({ callback_query: ctx.callbackQuery });
  });

  bot.action('admin_logs', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const logPath = path.join(process.cwd(), 'bot.log');
      
      if (!fs.existsSync(logPath)) {
        await ctx.editMessageText('📋 Логи\n━━━━━━━━━━━━━━━\n\n❌ Файл логов не найден', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Назад', callback_data: 'admin_back' }]
            ]
          }
        });
        return;
      }
      
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());
      const lastLines = lines.slice(-50).join('\n');
      
      const logText = lastLines || 'Логи пусты';
      const truncatedLog = logText.length > 3500 ? logText.slice(-3500) : logText;
      
      await ctx.editMessageText(
        `📋 Логи (последние 50 строк)\n━━━━━━━━━━━━━━━\n\n\`\`\`\n${truncatedLog}\n\`\`\``,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Обновить', callback_data: 'admin_logs' }],
              [{ text: '🔙 Назад', callback_data: 'admin_back' }]
            ]
          }
        }
      );
    } catch (err) {
      console.error('Error reading logs:', err);
      await ctx.editMessageText('📋 Логи\n━━━━━━━━━━━━━━━\n\n❌ Ошибка чтения логов', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'admin_back' }]
          ]
        }
      });
    }
  });

  bot.action('admin_back', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    await ctx.answerCbQuery();
    
    const users = db.getAllUsers();
    const accounts = db.getAllSteamAccounts();
    const activeFarms = farmManager.getActiveFarms();
    
    // Получаем использование ресурсов
    const memUsage = process.memoryUsage();
    const memUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const memTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const uptime = Math.floor(process.uptime());
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);

    const activeUsers = users.filter(u => {
      const info = db.getUserSubscriptionInfo(u.telegram_id);
      return info.isPremium || info.isTrial;
    }).length;

    let text = `👮‍♂️ Админ-панель\n━━━━━━━━━━━━━━━\n\n`;
    
    text += `📊 Статистика:\n`;
    text += `👥 Пользователей: ${users.length}\n`;
    text += `✅ Активных: ${activeUsers}\n`;
    text += `🎮 Аккаунтов: ${accounts.length}\n`;
    text += `🟢 Фармит: ${activeFarms.length}\n\n`;
    
    text += `💻 Ресурсы:\n`;
    text += `🧠 RAM: ${memUsedMB}/${memTotalMB} МБ\n`;
    text += `⏱ Uptime: ${uptimeHours}ч ${uptimeMinutes}м\n\n`;
    
    text += `📦 Подписки:\n`;
    text += `📦 Базовый: ${users.filter(u => db.getUserSubscriptionInfo(u.telegram_id).tier === 1).length}\n`;
    text += `⭐ Полный: ${users.filter(u => db.getUserSubscriptionInfo(u.telegram_id).tier === 2).length}\n`;
    text += `🎁 Триал: ${users.filter(u => db.getUserSubscriptionInfo(u.telegram_id).isTrial).length}\n`;

    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👥 Пользователи', callback_data: 'admin_users' },
            { text: '🎮 Фарм', callback_data: 'admin_farms' }
          ],
          [
            { text: '💳 Платежи', callback_data: 'admin_payments' },
            { text: '📊 Статистика', callback_data: 'admin_stats' }
          ],
          [
            { text: '⚙️ Система', callback_data: 'admin_system' },
            { text: '📋 Логи', callback_data: 'admin_logs' }
          ]
        ]
      }
    });
  });

  bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery();
  });

  // ===== STATISTICS =====

  bot.action(/^stats_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    await ctx.answerCbQuery();

    const stats = db.getFarmStats(accountId, 7);
    const topGames = db.getTopFarmedGames(accountId);
    
    const weekHours = stats.reduce((sum, s) => sum + s.hours_farmed, 0);
    const avgPerDay = weekHours / 7;
    const totalHours = account.total_hours_farmed || 0;

    // Прогноз на месяц
    const forecastMonth = (avgPerDay * 30).toFixed(1);

    let text = `📊 Статистика фарма\n`;
    text += `━━━━━━━━━━━━━━━\n\n`;
    text += `👤 Аккаунт: ${account.account_name}\n\n`;
    
    text += `📈 За последние 7 дней:\n`;
    if (stats.length > 0) {
      stats.slice(0, 5).forEach(s => {
        text += `  ${s.date}: ${s.hours_farmed.toFixed(1)}ч\n`;
      });
    } else {
      text += `  Нет данных\n`;
    }
    
    text += `\n💯 Итого:\n`;
    text += `  За неделю: ${weekHours.toFixed(1)}ч\n`;
    text += `  В среднем/день: ${avgPerDay.toFixed(1)}ч\n`;
    text += `  Всего нафармлено: ${totalHours.toFixed(1)}ч\n\n`;
    
    text += `🔮 Прогноз:\n`;
    text += `  Через 30 дней: ~${forecastMonth}ч\n\n`;
    
    text += `🎮 Топ-5 игр:\n`;
    if (topGames.length > 0) {
      topGames.forEach((game, i) => {
        text += `  ${i + 1}. ${game.game_name}\n`;
      });
    } else {
      text += `  Нет игр\n`;
    }

    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: `stats_${accountId}` }],
          [{ text: '🔙 К аккаунту', callback_data: `account_${accountId}` }]
        ]
      }
    });
  });

  // ===== GOALS =====

  bot.action(/^goals_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    await ctx.answerCbQuery();

    const goals = db.getActiveGoals(accountId);
    const totalHours = account.total_hours_farmed || 0;

    let text = `🎯 Цели фарма\n`;
    text += `━━━━━━━━━━━━━━━\n\n`;
    text += `👤 Аккаунт: ${account.account_name}\n`;
    text += `⏱ Всего нафармлено: ${totalHours.toFixed(1)}ч\n\n`;

    if (goals.length > 0) {
      text += `📋 Активные цели:\n\n`;
      goals.forEach((goal, i) => {
        const progress = (goal.current_hours / goal.target_hours * 100).toFixed(0);
        const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
        const gameName = goal.game_id ? 
          db.getGames(accountId).find(g => g.app_id === goal.game_id)?.game_name || 'Неизвестная игра' 
          : 'Общая цель';
        
        text += `${i + 1}. ${gameName}\n`;
        text += `   Цель: ${goal.target_hours}ч\n`;
        text += `   Прогресс: ${goal.current_hours.toFixed(1)}ч (${progress}%)\n`;
        text += `   [${progressBar}]\n`;
        
        if (goal.deadline) {
          const daysLeft = Math.ceil((goal.deadline - Math.floor(Date.now() / 1000)) / 86400);
          text += `   ⏰ Осталось дней: ${daysLeft}\n`;
        }
        text += `\n`;
      });
    } else {
      text += `Нет активных целей\n\n`;
      text += `💡 Цели помогают отслеживать прогресс фарма!`;
    }

    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: `goals_${accountId}` }],
          [{ text: '🔙 К аккаунту', callback_data: `account_${accountId}` }]
        ]
      }
    });
  });

  // ===== SCHEDULE =====

  bot.action(/^schedule_(\d+)$/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const account = db.getSteamAccount(accountId);

    if (!account || account.user_id !== ctx.from.id) {
      await ctx.answerCbQuery('❌ Аккаунт не найден');
      return;
    }

    await ctx.answerCbQuery();

    const schedules = db.getSchedules(accountId);

    let text = `⏰ Расписание фарма\n`;
    text += `━━━━━━━━━━━━━━━\n\n`;
    text += `👤 Аккаунт: ${account.account_name}\n\n`;

    if (schedules.length > 0) {
      text += `📋 Активные расписания:\n\n`;
      schedules.forEach((schedule, i) => {
        const days = schedule.days_of_week.split(',').map(d => {
          const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
          return dayNames[parseInt(d)];
        }).join(', ');
        
        text += `${i + 1}. ${schedule.start_time} - ${schedule.end_time}\n`;
        text += `   Дни: ${days}\n`;
        text += `   Статус: ${schedule.enabled ? '✅ Активно' : '❌ Отключено'}\n\n`;
      });
    } else {
      text += `Нет расписаний\n\n`;
      text += `💡 Без расписания фарм работает 24/7`;
    }

    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: `schedule_${accountId}` }],
          [{ text: '🔙 К аккаунту', callback_data: `account_${accountId}` }]
        ]
      }
    });
  });

  // ===== TEXT MESSAGE HANDLERS =====
  
  bot.on('text', async (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;

    try {
      switch (state.action) {
        case 'add_game': {
          const appId = parseInt(ctx.message.text.trim());
          
          if (isNaN(appId) || appId <= 0) {
            await ctx.reply('❌ Неверный формат. Отправьте числовой App ID игры.');
            return;
          }

          const account = db.getSteamAccount(state.accountId);
          if (!account || account.user_id !== ctx.from.id) {
            await ctx.reply('❌ Аккаунт не найден');
            userStates.delete(ctx.from.id);
            return;
          }

          const games = db.getGames(state.accountId);
          const maxGames = db.getGamesLimit(account.user_id);
          if (games.length >= maxGames) {
            await ctx.reply(`❌ Достигнут лимит игр (${maxGames})`);
            userStates.delete(ctx.from.id);
            return;
          }

          const existingGame = games.find(g => g.app_id === appId);
          if (existingGame) {
            await ctx.reply('❌ Эта игра уже добавлена');
            return;
          }

          try {
            const gameInfo = await steamLibrary.getGameInfo(appId);
            db.addGame(state.accountId, appId, gameInfo.name);
            
            await ctx.reply(
              `✅ Игра добавлена!\n\n` +
              `🎮 ${gameInfo.name}\n` +
              `🆔 App ID: ${appId}`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🎮 Мои игры', callback_data: `games_${state.accountId}` }],
                    [{ text: '🔙 К аккаунту', callback_data: `account_${state.accountId}` }]
                  ]
                }
              }
            );

            if (account.is_farming) {
              await farmManager.restartFarming(state.accountId);
              await ctx.reply('🔄 Фарм перезапущен с новой игрой');
            }
          } catch (err) {
            console.error('Error adding game:', err);
            await ctx.reply('❌ Не удалось получить информацию об игре. Проверьте App ID.');
          }

          userStates.delete(ctx.from.id);
          break;
        }

        case 'change_status': {
          const statusText = ctx.message.text.trim();
          
          if (statusText.length > 100) {
            await ctx.reply('❌ Статус слишком длинный (максимум 100 символов)');
            return;
          }

          const account = db.getSteamAccount(state.accountId);
          if (!account || account.user_id !== ctx.from.id) {
            await ctx.reply('❌ Аккаунт не найден');
            userStates.delete(ctx.from.id);
            return;
          }

          db.setCustomStatus(state.accountId, statusText);
          
          await ctx.reply(
            `✅ Статус обновлен!\n\n` +
            `💬 "${statusText}"`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔙 К аккаунту', callback_data: `account_${state.accountId}` }]
                ]
              }
            }
          );

          if (account.is_farming) {
            await farmManager.restartFarming(state.accountId);
            await ctx.reply('🔄 Фарм перезапущен с новым статусом');
          }

          userStates.delete(ctx.from.id);
          break;
        }

        case 'set_pin': {
          const pinText = ctx.message.text.trim();
          
          if (pinText === '0') {
            db.setFamilyPin(state.accountId, null);
            await ctx.reply(
              '✅ PIN удален',
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔙 К аккаунту', callback_data: `account_${state.accountId}` }]
                  ]
                }
              }
            );
            userStates.delete(ctx.from.id);
            return;
          }

          if (!/^\d{4}$/.test(pinText)) {
            await ctx.reply('❌ PIN должен состоять из 4 цифр');
            return;
          }

          const account = db.getSteamAccount(state.accountId);
          if (!account || account.user_id !== ctx.from.id) {
            await ctx.reply('❌ Аккаунт не найден');
            userStates.delete(ctx.from.id);
            return;
          }

          db.setFamilyPin(state.accountId, pinText);
          
          await ctx.reply(
            `✅ PIN установлен!\n\n` +
            `🔐 ${pinText}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔙 К аккаунту', callback_data: `account_${state.accountId}` }]
                ]
              }
            }
          );

          if (account.is_farming) {
            await farmManager.restartFarming(state.accountId);
            await ctx.reply('🔄 Фарм перезапущен с новым PIN');
          }

          userStates.delete(ctx.from.id);
          break;
        }

        case 'add_account_credentials_step1': {
          const login = ctx.message.text.trim();
          
          if (!login || login.length < 3) {
            await ctx.reply('❌ Логин слишком короткий');
            return;
          }
          
          userStates.set(ctx.from.id, { action: 'add_account_credentials_step2', login });
          
          await ctx.reply(
            '🔑 Теперь отправьте пароль от аккаунта:',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '❌ Отмена', callback_data: 'accounts' }]
                ]
              }
            }
          );
          break;
        }

        case 'add_account_credentials_step2': {
          const password = ctx.message.text.trim();
          
          if (!password || password.length < 6) {
            await ctx.reply('❌ Пароль слишком короткий');
            return;
          }
          
          const { login } = state;
          
          await ctx.reply('⏳ Авторизация...');
          
          try {
            const { createCredentialsAuth, getActiveSession } = await import('../services/steamAuth.js');
            
            const result = await createCredentialsAuth(ctx.from.id, login, password);
            
            // Проверяем что требуется
            const session = getActiveSession(ctx.from.id);
            
            if (!session) {
              await ctx.reply('❌ Ошибка: сессия не найдена');
              userStates.delete(ctx.from.id);
              return;
            }
            
            // Проверяем нужен ли Steam Guard код
            // Если авторизация не завершена - значит нужен код
            if (!session.session.refreshToken) {
              // Требуется Steam Guard код
              userStates.set(ctx.from.id, { action: 'add_account_steamguard', login });
              
              await ctx.reply(
                '🔐 Требуется Steam Guard код\n\n' +
                'Отправьте код из:\n' +
                '• Email (если Steam Guard через почту)\n' +
                '• Мобильного приложения Steam\n\n' +
                '⏱ Код действителен несколько минут',
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '❌ Отмена', callback_data: 'cancel_auth' }]
                    ]
                  }
                }
              );
            } else {
              // Авторизация успешна без Steam Guard - сохраняем аккаунт
              const refreshToken = session.session.refreshToken;
              const accountName = session.session.accountName || login;
              
              const accountId = db.addSteamAccount(ctx.from.id, accountName, null, null, null, refreshToken);
              
              // Удаляем сессию
              const { cancelAuth } = await import('../services/steamAuth.js');
              cancelAuth(ctx.from.id);
              userStates.delete(ctx.from.id);
              
              await ctx.reply(
                `✅ Аккаунт добавлен!\n\n` +
                `👤 ${accountName}\n\n` +
                `Теперь вы можете добавить игры и запустить фарм.`,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '🎮 Добавить игры', callback_data: `games_${accountId}` }],
                      [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }]
                    ]
                  }
                }
              );
            }
          } catch (error) {
            console.error('Credentials auth error:', error);
            await ctx.reply(`❌ Ошибка авторизации: ${error.message}`);
            userStates.delete(ctx.from.id);
          }
          break;
        }

        case 'add_account_steamguard': {
          const code = ctx.message.text.trim();
          
          if (!/^[A-Z0-9]{5}$/.test(code)) {
            await ctx.reply('❌ Неверный формат кода. Код должен содержать 5 символов (буквы и цифры)');
            return;
          }
          
          await ctx.reply('⏳ Проверка кода...');
          
          try {
            const { submitSteamGuardCode } = await import('../services/steamAuth.js');
            
            const result = await submitSteamGuardCode(ctx.from.id, code);
            
            await ctx.reply(
              `✅ Аккаунт добавлен!\n\n` +
              `👤 ${result.accountName}\n\n` +
              `Теперь вы можете добавить игры и запустить фарм.`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🎮 Добавить игры', callback_data: `games_${result.accountId}` }],
                    [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }]
                  ]
                }
              }
            );
            
            userStates.delete(ctx.from.id);
          } catch (error) {
            console.error('Steam Guard error:', error);
            await ctx.reply(`❌ Ошибка: ${error.message}\n\nПопробуйте ещё раз или отмените авторизацию.`);
          }
          break;
        }

        case 'add_account': {
          const parts = ctx.message.text.trim().split(':');
          
          if (parts.length < 5) {
            await ctx.reply(
              '❌ Неверный формат!\n\n' +
              'Ожидается: login:password:shared_secret:identity_secret:refresh_token'
            );
            return;
          }

          const [login, password, sharedSecret, identitySecret, refreshToken] = parts;

          if (!login || !password || !sharedSecret || !identitySecret || !refreshToken) {
            await ctx.reply('❌ Все поля обязательны для заполнения');
            return;
          }

          const limit = db.getAccountLimit(ctx.from.id);
          const currentAccounts = db.getSteamAccounts(ctx.from.id);
          
          if (currentAccounts.length >= limit) {
            await ctx.reply(
              `❌ Достигнут лимит аккаунтов (${limit})\n\n` +
              'Оформите подписку для увеличения лимита',
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '💎 Подписка', callback_data: 'subscribe' }]
                  ]
                }
              }
            );
            userStates.delete(ctx.from.id);
            return;
          }

          const existingAccount = currentAccounts.find(acc => acc.account_name === login);
          if (existingAccount) {
            await ctx.reply('❌ Аккаунт с таким логином уже добавлен');
            userStates.delete(ctx.from.id);
            return;
          }

          try {
            const accountId = db.addSteamAccount(
              ctx.from.id,
              login,
              password,
              sharedSecret,
              identitySecret,
              refreshToken
            );

            await ctx.reply(
              `✅ Аккаунт добавлен!\n\n` +
              `👤 ${login}\n\n` +
              `Теперь вы можете добавить игры и запустить фарм.`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🎮 Добавить игры', callback_data: `games_${accountId}` }],
                    [{ text: '📋 Мои аккаунты', callback_data: 'accounts' }]
                  ]
                }
              }
            );
          } catch (err) {
            console.error('Error adding account:', err);
            await ctx.reply('❌ Ошибка при добавлении аккаунта. Проверьте данные.');
          }

          userStates.delete(ctx.from.id);
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Text handler error:', err);
      await ctx.reply('❌ Произошла ошибка. Попробуйте снова.');
      userStates.delete(ctx.from.id);
    }
  });

  // ===== PHOTO MESSAGE HANDLERS =====
  
  bot.on('photo', async (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;

    try {
      if (state.action === 'await_proof') {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const caption = ctx.message.caption || '';
        
        const tierName = state.tier === 2 ? '⭐ Полный' : '📦 Базовый';
        
        // Отправляем уведомление администраторам
        for (const adminId of ADMIN_IDS) {
          try {
            await bot.telegram.sendPhoto(adminId, photo.file_id, {
              caption: 
                `💳 Новое подтверждение оплаты\n` +
                `━━━━━━━━━━━━━━━\n` +
                `👤 User ID: ${ctx.from.id}\n` +
                `👤 Username: @${ctx.from.username || 'нет'}\n` +
                `📦 Тариф: ${tierName}\n` +
                `💬 Комментарий: ${caption}\n` +
                `━━━━━━━━━━━━━━━\n` +
                `Проверьте платеж и активируйте подписку вручную.`,
              reply_markup: {
                inline_keyboard: [
                  [{ text: '✅ Активировать', callback_data: `approve_payment_${ctx.from.id}_${state.tier}` }],
                  [{ text: '❌ Отклонить', callback_data: `reject_payment_${ctx.from.id}` }]
                ]
              }
            });
          } catch (err) {
            console.error('Error sending proof to admin:', err);
          }
        }

        await ctx.reply(
          '✅ Подтверждение отправлено!\n\n' +
          'Администратор проверит платеж и активирует подписку в течение 24 часов.\n\n' +
          'Спасибо за ожидание! ❤️',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Главное меню', callback_data: 'profile' }]
              ]
            }
          }
        );

        userStates.delete(ctx.from.id);
      }
    } catch (err) {
      console.error('Photo handler error:', err);
      await ctx.reply('❌ Произошла ошибка при обработке фото. Попробуйте снова.');
      userStates.delete(ctx.from.id);
    }
  });
}