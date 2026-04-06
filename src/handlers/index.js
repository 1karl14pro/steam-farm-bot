import bot, { ADMIN_IDS, BOT_USERNAME } from '../bot.js';
import * as db from '../database.js';
import * as farmManager from '../services/farmManager.js';
import * as steamLibrary from '../services/steamLibrary.js';
import * as formatter from '../services/formatter.js';
import { MAX_GAMES_PER_ACCOUNT } from '../constants.js';
import { userStates } from '../utils.js';

export function setupHandlers() {
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
    const subLabel = info.isPremium ? '⭐ Premium' : limit === 3 ? '❌ Без подписки' : '🎁 Триал';
    const header = `📋 Steam аккаунты\n━━━━━━━━━━━━━━━\n${subLabel} | Аккаунтов: ${limitText}\n`;

    await ctx.editMessageText(header, {
      reply_markup: { inline_keyboard: buttons }
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

    let text = `🎮 Игры для ${account.account_name}\n\n`;
    text += formatter.formatGamesList(games);
    text += `\nВсего: ${games.length}/${MAX_GAMES_PER_ACCOUNT}`;

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
      const maxGames = MAX_GAMES_PER_ACCOUNT;
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

      let text = `📚 Библиотека игр для ${account.account_name}\n\n`;
      text += `Всего: ${library.length} игр\n`;
      text += `Страница: ${page + 1}/${totalPages}\n`;

      // Получаем выбранные игры для отображения галочек
      const selectedGames = db.getGames(accountId);
      const selectedAppIds = new Set(selectedGames.map(g => g.app_id));

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
    const maxGames = db.getAccountLimit(account.user_id) === -1 ? Infinity : db.getAccountLimit(account.user_id) * 32; // 32 игры на аккаунт для премиум пользователей
    if (games.length >= Math.min(maxGames, 32)) { // Ограничиваем 32 играми на аккаунт
      const limit = Math.min(maxGames, 32);
      await ctx.answerCbQuery(`❌ Достигнут лимит игр (${limit})`, { show_alert: true });
      return;
    }

    await ctx.answerCbQuery('⏳ Добавляю игру...');

    // Получаем название игры для отображения
    const { getOwnedGames } = await import('../services/steamLibrary.js');
    const library = await getOwnedGames(accountId);
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
          await ctx.reply('🔄 Фарм перезапущен с новой игрой');
        } catch (err) {
          console.error('Ошибка перезапуска:', err);
        }
      }
    }
    
    ctx.callbackQuery.data = `library_${accountId}`;
    await bot.handleUpdate({ callback_query: ctx.callbackQuery });
  });

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
      
      // Обновляем сообщение с деталями аккаунта
      const acc = db.getSteamAccount(accountId);
      const games = db.getGames(accountId);
      const text = formatter.formatAccountInfo(acc, games);

      const buttons = [
        [{ text: '⏸ Остановить фарм', callback_data: `stop_${accountId}` }],
        [{ text: '🎮 Настроить игры', callback_data: `games_${accountId}` }],
        [{ text: '💬 Изменить статус', callback_data: `change_status_${accountId}` }],
        [{ text: '👁 Видимость', callback_data: `visibility_${accountId}` }],
        [{ text: '🗑 Удалить аккаунт', callback_data: `delete_${accountId}` }],
        [{ text: '🔙 К списку аккаунтов', callback_data: 'accounts' }]
      ];

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
      
      // Обновляем сообщение с деталями аккаунта
      const acc = db.getSteamAccount(accountId);
      const games = db.getGames(accountId);
      const text = formatter.formatAccountInfo(acc, games);

      const buttons = [
        [{ text: '▶️ Запустить фарм', callback_data: `start_${accountId}` }],
        [{ text: '🎮 Настроить игры', callback_data: `games_${accountId}` }],
        [{ text: '💬 Изменить статус', callback_data: `change_status_${accountId}` }],
        [{ text: '👁 Видимость', callback_data: `visibility_${accountId}` }],
        [{ text: '🗑 Удалить аккаунт', callback_data: `delete_${accountId}` }],
        [{ text: '🔙 К списку аккаунтов', callback_data: 'accounts' }]
      ];

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
    const text = `🎮 Игры для ${acc.account_name}\n\n${formatter.formatGamesList(updatedGames)}\nВсего: ${updatedGames.length}/${MAX_GAMES_PER_ACCOUNT}`;

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
    userStates.set(ctx.from.id, { action: 'add_account' });

    await ctx.editMessageText(
      '🔗 Добавить Steam аккаунт\n\n' +
      'Отправьте данные от аккаунта в формате:\n\n' +
      'login:password:shared_secret:identity_secret:refresh_token\n\n' +
      'Как получить данные:\n\n' +
      '1. Установите Steam Desktop Authenticator (SDA)\n' +
      '2. Добавьте аккаунт в SDA\n' +
      '3. Найдите файл *.maFile в папке SDA\n' +
      '4. Извлеките из него все необходимые данные\n\n' +
      '🔒 Все данные хранятся локально и не передаются третьим лицам.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'accounts' }]
          ]
        }
      }
    );
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
    const payments = db.getPendingPayments();
    const now = Math.floor(Date.now() / 1000);

    const activeUsers = users.filter(u => {
      const info = db.getUserSubscriptionInfo(u.telegram_id);
      return info.isPremium || info.isTrial;
    }).length;

    let text = `👮‍♂️ Панель администратора\n━━━━━━━━━━━━━━━\n`;
    text += `👥 Пользователей: ${users.length}\n`;
    text += `👤 Активных: ${activeUsers}\n`;
    text += `游戏代练 Аккаунтов: ${accounts.length}\n`;
    text += `💳 Платежей: ${payments.length}\n\n`;
    
    text += `📊 Статистика подписок:\n`;
    text += `📦 Базовый: ${users.filter(u => db.getUserSubscriptionInfo(u.telegram_id).tier === 1).length}\n`;
    text += `⭐ Полный: ${users.filter(u => db.getUserSubscriptionInfo(u.telegram_id).tier === 2).length}\n`;
    text += `🎁 Триал: ${users.filter(u => db.getUserSubscriptionInfo(u.telegram_id).isTrial).length}\n`;

    await ctx.reply(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Список платежей', callback_data: 'admin_payments' }],
          [{ text: '👤 Список пользователей', callback_data: 'admin_users' }],
          [{ text: '📊 Статистика', callback_data: 'admin_stats' }]
        ]
      }
    });
  });

  bot.action('admin_payments', async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;
    
    const payments = db.getPendingPayments();
    if (payments.length === 0) {
      await ctx.editMessageText('📭 Нет ожидающих платежей');
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
          [{ text: '🔙 Назад', callback_data: 'admin_panel' }]
        ]
      }
    });
  });
}