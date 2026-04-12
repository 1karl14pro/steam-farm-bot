import SteamUser from 'steam-user';
import * as db from '../database.js';
import * as tradeManager from './tradeManager.js';

// Хранилище активных клиентов Steam
const activeClients = new Map();
const accountCookies = new Map();
const stoppingAccounts = new Set();

// Лимиты для оптимизации ресурсов
const MAX_CONCURRENT_SESSIONS = 100; // Максимум одновременных сессий
const SESSION_RESTART_INTERVAL = 24 * 60 * 60 * 1000; // 24 часа - перезапуск для освобождения памяти
const MEMORY_CHECK_INTERVAL = 3600000; // Проверка каждый час

/**
 * Запускает фарм для аккаунта
 * @param {number} accountId - ID аккаунта из БД
 * @returns {Promise<void>}
 */
export async function startFarming(accountId) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  // Проверяем, не запущен ли уже
  if (activeClients.has(accountId)) {
    throw new Error('Фарм уже запущен для этого аккаунта');
  }

  // Проверяем лимит одновременных сессий
  if (activeClients.size >= MAX_CONCURRENT_SESSIONS) {
    throw new Error(`Достигнут лимит одновременных сессий (${MAX_CONCURRENT_SESSIONS})`);
  }

  const games = db.getGames(accountId);
  if (games.length === 0) {
    throw new Error('Добавьте хотя бы одну игру для фарма');
  }

  const appIds = games.map(g => g.app_id);

  // Создаем клиент Steam
  const client = new SteamUser();

  // Обработчики событий с изоляцией ошибок
  client.on('loggedOn', async () => {
    try {
      console.log(`✅ ${account.account_name} вошел в сеть`);
      
      // Сохраняем Steam ID 64 в базу данных
      const steamId64 = client.steamID.getSteamID64();
      await db.updateSteamId64(accountId, steamId64);
      console.log(`🆔 Сохранен Steam ID для ${account.account_name}: ${steamId64}`);
      
      const visibilityMode = db.getVisibilityMode(accountId);
      if (visibilityMode === 1) {
        client.setPersona(7);
        console.log(`👻 ${account.account_name}: режим "Невидимка"`);
      } else {
        client.setPersona(1);
        console.log(`🌐 ${account.account_name}: режим "В сети"`);
      }
      
      // Запускаем фарм игр с кастомным названием, если задано
      const customStatus = db.getCustomStatus(accountId);
      
      if (customStatus && appIds.length > 0) {
        // Используем метод ASF: сначала сбрасываем, потом добавляем shortcut с кастомным именем, затем все игры
        // Это позволяет отображать кастомный статус в профиле при фарме всех игр
        
        // Шаг 1: Сбрасываем текущее состояние
        client.gamesPlayed([]);
        
        // Шаг 2: Ждем немного
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Шаг 3: Создаем массив игр: сначала shortcut с кастомным именем, потом все реальные игры
        const gamesToPlay = [
          {
            game_id: 15190414816125648896, // Это uint.MaxValue как GameID для shortcut
            game_extra_info: customStatus,
            game_name: customStatus
          },
          ...appIds.map(appId => appId)
        ];
        
        client.gamesPlayed(gamesToPlay);
        console.log(`💬 Кастомный статус: ${account.account_name} - ${customStatus} (запущено игр: ${appIds.length})`);
      } else {
        // Обычный запуск всех игр без кастомного статуса
        client.gamesPlayed(appIds);
      }
      
      // Пытаемся получить веб-сессию для cookies
      try {
        await client.webLogOn();
        console.log(`🌐 Веб-сессия получена для ${account.account_name}`);
        
        // Инициализируем менеджер трейдов после получения веб-сессии
        tradeManager.initTradeManager(client, accountId, account.account_name);
      } catch (webErr) {
        console.error(`❌ Ошибка получения веб-сессии для ${account.account_name}:`, webErr.message);
      }
      
      const now = Math.floor(Date.now() / 1000);
      await db.setFarmingStartedAt(accountId, now);
      await db.updateAccountFarmingStatus(accountId, true);
    } catch (err) {
      console.error(`❌ Ошибка при запуске фарма ${account.account_name}:`, err.message);
      // Не останавливаем клиент, продолжаем работу
    }
  });
  
  // Обработчик запросов в друзья
  client.on('friendRelationship', async (steamID, relationship) => {
    // relationship === 2 означает запрос в друзья
    if (relationship === 2) {
      const settings = db.getNotificationSettings(account.user_id);
      const friendRequestSetting = settings.find(s => s.type === 'friend_request');
      
      if (friendRequestSetting && friendRequestSetting.enabled) {
        try {
          // Запрашиваем информацию о пользователе
          client.requestRichPresence(steamID.accountid, (err, response) => {
            // Игнорируем ошибки rich presence
          });
          
          // Ждем немного и пытаемся получить имя из кеша
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          let userName = 'Неизвестный пользователь';
          const steamId64 = steamID.getSteamID64();
          
          // Пытаемся получить из кеша users
          if (client.users && client.users[steamId64]) {
            userName = client.users[steamId64].player_name || userName;
          }
          
          const bot = (await import('../bot.js')).default;
          await bot.telegram.sendMessage(
            account.user_id,
            `👥 Новый запрос в друзья!\n\n` +
            `Аккаунт: ${account.account_name}\n` +
            `От: ${userName}\n` +
            `Steam ID: ${steamId64}\n\n` +
            `Откройте Steam для принятия/отклонения.`
          );
          console.log(`[NOTIFICATIONS] Отправлено уведомление о запросе в друзья для ${account.account_name} от ${userName}`);
        } catch (err) {
          console.error(`[NOTIFICATIONS] Ошибка отправки уведомления:`, err.message);
        }
      }
    }
  });
  
  // Обработчик предложений обмена
  client.on('tradeOffers', async (count) => {
    if (count > 0) {
      const settings = db.getNotificationSettings(account.user_id);
      const tradeSetting = settings.find(s => s.type === 'trade_offer');
      
      if (tradeSetting && tradeSetting.enabled) {
        try {
          const bot = (await import('../bot.js')).default;
          await bot.telegram.sendMessage(
            account.user_id,
            `💼 Новое предложение обмена!\n\n` +
            `Аккаунт: ${account.account_name}\n` +
            `Количество: ${count}\n\n` +
            `Откройте Steam для просмотра.`
          );
          console.log(`[NOTIFICATIONS] Отправлено уведомление о трейде для ${account.account_name}`);
        } catch (err) {
          console.error(`[NOTIFICATIONS] Ошибка отправки уведомления:`, err.message);
        }
      }
    }
  });
  
  // Обработчик веб-сессии - вызывается при успешном создании веб-сессии
  client.on('webSession', (sessionID, cookies) => {
    try {
      console.log(`🔐 Получены веб-сессия и cookies для аккаунта ${account.account_name}`);
      // Сохраняем cookies для использования в веб-запросах
      accountCookies.set(accountId, cookies);
      console.log(`🔐 Сохранены ${cookies.length} cookies для аккаунта ${accountId}`);
    } catch (err) {
      console.error(`❌ Ошибка сохранения cookies для ${account.account_name}:`, err.message);
    }
  });

  client.on('error', async (err) => {
    try {
      console.error(`❌ Ошибка ${account.account_name}:`, err.message);
      
      // Если это LoggedInElsewhere - значит игра запущена на ПК
      if (err.message === 'LoggedInElsewhere') {
        console.log(`⏸ ${account.account_name}: Игра запущена на ПК`);
        
        // Уведомляем пользователя
        try {
          const bot = (await import('../bot.js')).default;
          bot.telegram.sendMessage(
            account.user_id,
            `⏸ Фарм приостановлен для ${account.account_name}\n\n` +
            `Причина: Игра запущена на вашем ПК\n` +
            `Запустите фарм вручную когда закончите играть.`
          ).catch((err) => {
            console.error(`❌ Ошибка отправки уведомления пользователю ${account.user_id}:`, err.message);
          });
        } catch (err) {
          console.error(`❌ Ошибка обработки конфликта для ${account.account_name}:`, err.message);
        }
        
        // Останавливаем фарм
        stopFarming(accountId).catch((err) => {
          console.error(`❌ Ошибка остановки фарма для аккаунта ${accountId}:`, err.message);
        });
        return;
      }
      
      // Если это LogonSessionReplaced - пытаемся перезапустить через 30 секунд
      if (err.message === 'LogonSessionReplaced') {
        console.log(`🔄 ${account.account_name}: Сессия заменена, перезапуск через 30 сек...`);
        
        // Останавливаем текущую сессию
        await stopFarming(accountId).catch(e => console.error(`Ошибка остановки:`, e));
        
        // Перезапускаем через 30 секунд
        setTimeout(async () => {
          try {
            console.log(`🔄 Перезапуск фарма для ${account.account_name}...`);
            await startFarming(accountId);
            console.log(`✅ Фарм перезапущен для ${account.account_name}`);
          } catch (restartErr) {
            console.error(`❌ Ошибка перезапуска ${account.account_name}:`, restartErr.message);
          }
        }, 30000);
        return;
      }
      
      // Останавливаем только этот аккаунт, не влияя на другие
      stopFarming(accountId).catch(e => console.error(`Ошибка остановки:`, e));
    } catch (e) {
      console.error(`❌ Критическая ошибка обработки для ${account.account_name}:`, e);
    }
  });

  client.on('disconnected', async (eresult, msg) => {
    try {
      console.log(`🔌 ${account.account_name} отключен:`, msg);
      
      if (stoppingAccounts.has(accountId)) return;
      stoppingAccounts.add(accountId);
      
      activeClients.delete(accountId);
      accountCookies.delete(accountId);
      
      const oldAccount = db.getSteamAccount(accountId);
      if (oldAccount && oldAccount.farming_started_at) {
        const farmingTime = Math.floor(Date.now() / 1000) - oldAccount.farming_started_at;
        const hours = farmingTime / 3600;
        await db.finalizeFarming(accountId, hours);
      } else {
        await db.updateAccountFarmingStatus(accountId, false);
      }
      
      stoppingAccounts.delete(accountId);
    } catch (err) {
      console.error(`❌ Ошибка при отключении ${account.account_name}:`, err.message);
      stoppingAccounts.delete(accountId);
    }
  });

  client.on('steamGuard', (domain, callback) => {
    console.log(`⚠️ ${account.account_name}: Требуется Steam Guard код${domain ? ` (${domain})` : ''}`);
  });

  // Обработка запроса PIN родительского контроля
  client.on('familyViewPinRequired', () => {
    console.log(`🔐 ${account.account_name}: требуется PIN родительского контроля`);
    const pin = db.getFamilyPin(accountId);
    if (pin) {
      client.setPin(pin);
      console.log(`🔐 ${account.account_name}: PIN применен`);
    } else {
      console.log(`⚠️ ${account.account_name}: PIN не установлен, фарм будет ограничен`);
    }
  });

  // Авторизуемся через refresh token
  try {
    client.logOn({
      refreshToken: account.refresh_token
    });

    // Сохраняем клиент
    activeClients.set(accountId, {
      client,
      accountName: account.account_name,
      startedAt: Date.now(),
      updateCookies: () => {
        if (client.webSessionID) {
          const cookies = [`sessionid=${client.webSessionID}`];
          if (client._wc && client._wc.tokens && client._wc.tokens.access_token) {
            cookies.push(`steamLoginSecure=${client._wc.tokens.access_token}`);
          }
          if (cookies.length > 0) {
            accountCookies.set(accountId, cookies);
            console.log(`🔐 Сохранены cookies для аккаунта ${accountId}: ${cookies.length} шт.`);
          }
        }
      }
    });

    // Пытаемся обновить cookies немедленно
    activeClients.get(accountId).updateCookies();

    // Также планируем проверку cookies позже (иногда они доступны с задержкой)
    setTimeout(() => {
      const clientData = activeClients.get(accountId);
      if (clientData) {
        clientData.updateCookies();
      }
    }, 5000);

  } catch (error) {
    console.error(`❌ Ошибка авторизации ${account.account_name}:`, error.message);
    throw new Error('Не удалось авторизоваться. Возможно, токен устарел.');
  }
}

/**
 * Останавливает фарм для аккаунта
 * @param {number} accountId - ID аккаунта из БД
 */
export async function stopFarming(accountId) {
  const clientData = activeClients.get(accountId);
  
  if (!clientData) {
    return; // Фарм уже остановлен
  }

  const { client, accountName } = clientData;
  
  client.gamesPlayed([]);
  
  stoppingAccounts.add(accountId);
  const disconnected = new Promise((resolve) => {
    client.once('disconnected', resolve);
    client.logOff();
  });
  
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  await Promise.race([disconnected, timeout]);
  
  // Останавливаем менеджер трейдов
  tradeManager.stopTradeManager(accountId);
  
  stoppingAccounts.delete(accountId);
  activeClients.delete(accountId);
  accountCookies.delete(accountId);
  
  const account = db.getSteamAccount(accountId);
  if (account && account.farming_started_at) {
    const farmingTime = Math.floor(Date.now() / 1000) - account.farming_started_at;
    const hours = farmingTime / 3600;
    await db.finalizeFarming(accountId, hours);
    
    // Записываем статистику за день
    db.recordFarmStats(accountId, hours);
    
    // Обновляем прогресс целей
    const goals = db.getActiveGoals(accountId);
    for (const goal of goals) {
      const totalHours = (account.total_hours_farmed || 0) + hours;
      db.updateGoalProgress(goal.id, totalHours);
    }
  } else {
    await db.updateAccountFarmingStatus(accountId, false);
  }
  
  console.log(`🛑 Фарм остановлен для ${accountName}`);
}

/**
 * Останавливает только игры, но оставляет клиент подключенным
 * Используется для разблокировки достижений
 * @param {number} accountId - ID аккаунта из БД
 */
export function pauseGames(accountId) {
  const clientData = activeClients.get(accountId);
  
  if (!clientData) {
    return false;
  }

  const { client } = clientData;
  client.gamesPlayed([]);
  
  return true;
}

/**
 * Возобновляет фарм игр (после паузы)
 * @param {number} accountId - ID аккаунта из БД
 */
export async function resumeGames(accountId) {
  const clientData = activeClients.get(accountId);
  
  if (!clientData) {
    return false;
  }

  const { client } = clientData;
  const account = db.getSteamAccount(accountId);
  
  if (!account) {
    return false;
  }

  const games = db.getGames(accountId);
  if (games.length === 0) {
    return false;
  }

  const appIds = games.map(g => g.app_id);
  const customStatus = db.getCustomStatus(accountId);
  
  if (customStatus && appIds.length > 0) {
    client.gamesPlayed([]);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const gamesToPlay = [
      {
        game_id: 15190414816125648896,
        game_extra_info: customStatus,
        game_name: customStatus
      },
      ...appIds.map(appId => appId)
    ];
    
    client.gamesPlayed(gamesToPlay);
  } else {
    client.gamesPlayed(appIds);
  }
  
  return true;
}

/**
 * Перезапускает фарм с новым списком игр
 * @param {number} accountId - ID аккаунта из БД
 */
export async function restartFarming(accountId) {
  try {
    if (activeClients.has(accountId)) {
      await stopFarming(accountId);
    }
    
    // Запускаем заново
    await startFarming(accountId);
    console.log(`🔄 Фарм перезапущен для аккаунта ${accountId}`);
  } catch (error) {
    console.error(`❌ Ошибка перезапуска фарма: ${error.message}`);
    throw error;
  }
}

/**
 * Получает информацию об активном фарме
 * @param {number} accountId - ID аккаунта
 * @returns {Object|null}
 */
export function getFarmingInfo(accountId) {
  const clientData = activeClients.get(accountId);
  if (!clientData) return null;

  const games = db.getGames(accountId);
  const uptime = Math.floor((Date.now() - clientData.startedAt) / 1000);

  return {
    accountName: clientData.accountName,
    gamesCount: games.length,
    uptime
  };
}

/**
 * Проверяет, запущен ли фарм для аккаунта
 * @param {number} accountId - ID аккаунта
 * @returns {boolean}
 */
export function isFarming(accountId) {
  return activeClients.has(accountId);
}

/**
 * Останавливает все активные фармы
 */
export async function stopAllFarming() {
  console.log('🛑 Остановка всех активных фармов...');
  
  const stops = [];
  for (const accountId of activeClients.keys()) {
    stops.push(
      stopFarming(accountId).catch((err) => {
        console.error(`Ошибка остановки фарма для аккаунта ${accountId}:`, err);
      })
    );
  }
  
  await Promise.all(stops);
}

/**
 * Получает список всех активных фармов
 * @returns {Array}
 */
export function getActiveFarms() {
  return Array.from(activeClients.keys());
}

/**
 * Получить Steam клиент для аккаунта
 * @param {number} accountId - ID аккаунта
 * @returns {SteamUser|null}
 */
export function getClient(accountId) {
  const clientData = activeClients.get(accountId);
  return clientData?.client || null;
}

/**
 * Получить cookies для аккаунта
 * @param {number} accountId - ID аккаунта
 * @returns {Array|null}
 */
export function getCookies(accountId) {
  return accountCookies.get(accountId) || null;
}

export function setAccountCookies(accountId, cookies) {
  accountCookies.set(accountId, cookies);
}

export function getAccountCookies(accountId) {
  return accountCookies.get(accountId) || [];
}

/**
 * Returns a summary of all farming sessions (status view).
 * Useful for quick diagnostics from Telegram.
 */
export function getAllFarmsStatus() {
  const statuses = [];
  const ids = getActiveFarms();
  for (const accountId of ids) {
    const account = db.getSteamAccount(accountId);
    const games = db.getGames(accountId);
    const startedAt = activeClients.get(accountId)?.startedAt ?? 0;
    const uptime = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    statuses.push({
      accountId,
      accountName: account?.account_name ?? `Account ${accountId}`,
      isFarming: !!account?.is_farming,
      startedAt,
      uptime,
      gamesCount: games.length,
      totalHoursFarmed: account?.total_hours_farmed ?? 0
    });
  }
  return statuses;
}

/**
 * Оптимизация памяти - только сборка мусора, БЕЗ автоперезапуска сессий
 * ИСПРАВЛЕНО: Убран автоматический перезапуск каждые 24 часа для избежания конфликтов между контейнерами
 */
function startMemoryOptimization() {
  setInterval(() => {
    // Только сборка мусора, без перезапуска сессий
    if (global.gc) {
      global.gc();
      console.log('♻️ Сборка мусора выполнена');
    }
    
    // Логируем статистику памяти для мониторинга
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    console.log(`📊 Память: ${heapUsedMB}MB / ${heapTotalMB}MB (активных сессий: ${activeClients.size})`);
  }, MEMORY_CHECK_INTERVAL);
}

// Запускаем оптимизацию памяти
startMemoryOptimization();

/**
 * Обновляет часы в играх для всех активных фарм-сессий
 * ВАЖНО: Использует Web API вместо создания новых сессий, чтобы не вызывать LogonSessionReplaced
 */
async function updateGameHoursForActiveFarms() {
  const activeFarms = getActiveFarms();
  
  for (const accountId of activeFarms) {
    try {
      const account = db.getSteamAccount(accountId);
      if (!account || !account.is_farming) continue;
      
      const games = db.getGames(accountId);
      if (games.length === 0) continue;
      
      // Используем Web API через Steam ID, чтобы не создавать новую сессию
      if (!process.env.STEAM_WEB_API_KEY || !account.steam_id_64) {
        console.log(`⚠️ Пропускаю ${account.account_name}: нет API ключа или Steam ID`);
        continue;
      }
      
      const { withRateLimit } = await import('./rateLimiter.js');
      
      // Получаем данные через Web API с rate limiting
      const data = await withRateLimit(async () => {
        const response = await fetch(
          `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${process.env.STEAM_WEB_API_KEY}&steamid=${account.steam_id_64}&include_appinfo=1&include_played_free_games=1`
        );
        return await response.json();
      }, 'api', 1);
      
      if (!data.response || !data.response.games) {
        console.log(`⚠️ Нет данных для ${account.account_name}`);
        continue;
      }
      
      // Обновляем часы для каждой игры в фарме
      let updated = 0;
      for (const game of games) {
        const steamGame = data.response.games.find(sg => sg.appid === game.app_id);
        if (steamGame && steamGame.playtime_forever !== undefined) {
          const currentHours = steamGame.playtime_forever / 60; // Конвертируем минуты в часы
          db.updateGameHours(accountId, game.app_id, currentHours);
          updated++;
        }
      }
      
      console.log(`📊 Обновлены часы для ${account.account_name} (${updated}/${games.length} игр)`);
    } catch (error) {
      console.error(`❌ Ошибка обновления часов для аккаунта ${accountId}:`, error.message);
    }
  }
}

/**
 * Запускает периодическое обновление часов (каждые 30 минут)
 */
function startGameHoursUpdater() {
  const UPDATE_INTERVAL = 30 * 60 * 1000; // 30 минут
  
  setInterval(async () => {
    console.log('🔄 Начинаю обновление часов в играх...');
    await updateGameHoursForActiveFarms();
    console.log('✅ Обновление часов завершено');
  }, UPDATE_INTERVAL);
  
  // Первое обновление через 5 минут после запуска
  setTimeout(async () => {
    console.log('🔄 Первое обновление часов в играх...');
    await updateGameHoursForActiveFarms();
    console.log('✅ Первое обновление часов завершено');
  }, 5 * 60 * 1000);
}

// Запускаем обновление часов
startGameHoursUpdater();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received, shutting down...');
  await stopAllFarming();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down...');
  await stopAllFarming();
  process.exit(0);
});
