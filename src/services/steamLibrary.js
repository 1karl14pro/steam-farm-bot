import SteamUser from 'steam-user';
import { LoginSession, EAuthTokenPlatformType } from 'steam-session';
import * as db from '../database.js';
import { readGameCache, writeGameCache, getSteamId64FromAccount } from './gameCache.js';

// Блокировка одновременных запросов к Steam для одного аккаунта
const accountLocks = new Map();

/**
 * Получает топ-10 игр по времени игры для аккаунта
 * @param {number} accountId - ID аккаунта из БД
 * @returns {Promise<Array>} - Список топ игр с часами игры
 */
export async function getTopPlayedGames(accountId, forceRefresh = false) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  const steamId64 = getSteamId64FromAccount(account);
  
  // Проверяем кеш если не форсируем обновление
  if (!forceRefresh) {
    const cache = readGameCache(steamId64);
    if (cache && cache.topPlayed && cache.topPlayed.length > 0) {
      console.log(`[CACHE] Использую кеш топ игр для ${account.account_name}`);
      return cache.topPlayed;
    }
  }

  let result = null;

  // Сначала попробуем получить через новую систему парсинга HTML
  try {
    const { saveGamesPage, parseGamesFromHtml } = await import('./steamParser.js');
    
    // Сохраняем HTML страницу игр
    const filePath = await saveGamesPage(accountId);
    
    // Парсим игры из HTML
    const games = await parseGamesFromHtml(filePath);
    
    if (games.length > 0) {
      result = games;
      
      // Сохраняем в кеш
      const cache = readGameCache(steamId64) || { library: [] };
      writeGameCache(steamId64, cache.library, games);
    }
  } catch (error) {
    console.error('Ошибка получения топ игр через HTML парсинг:', error.message);
  }

  if (result) {
    return result;
  }
  
  // Если парсинг не удался, пробуем Web API
  if (process.env.STEAM_WEB_API_KEY) {
    try {
      // Получаем cookies для данного аккаунта
      const { getCookies } = await import('./sessionManager.js');
      const cookies = getCookies(accountId);
      
      if (cookies && cookies.length > 0) {
        // Ищем steamLoginSecure cookie для получения SteamID
        const steamLoginCookie = cookies.find(c => c.includes('steamLoginSecure'));
        if (steamLoginCookie) {
          // Формат: steamLoginSecure=76561198000000000||hash
          const cookieValue = steamLoginCookie.split('=')[1]?.split(';')[0];
          const steamId = cookieValue?.split('||')[0];
          
          if (steamId && /^\d+$/.test(steamId)) { // Проверяем что это число
            // Запрашиваем список игр с Web API
            const response = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${process.env.STEAM_WEB_API_KEY}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`);
            const data = await response.json();
            
            if (data.response && data.response.games) {
              // Сортируем по времени в игре и берем топ-10
              const topGames = data.response.games
                .filter(game => game.playtime_forever > 0) // Только игры с временем
                .sort((a, b) => b.playtime_forever - a.playtime_forever)
                .slice(0, 10)
                .map(game => ({
                  appId: game.appid,
                  name: game.name,
                  playtime_forever: game.playtime_forever // В минутах
                }));
              
              if (topGames.length > 0) {
                result = topGames;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Ошибка получения топ игр через Web API:', error.message);
    }
  }

  if (result) {
    return result;
  }
  
  // Fallback к библиотеке игр
  const libraryGames = await getOwnedGames(accountId);
  return libraryGames.slice(0, 10).map(game => ({
    appId: game.appId,
    name: game.name,
    playtime_forever: 0 // Нет данных о времени игры
  }));
}

/**
 * Checks if parental control is enabled for the given account.
 * Returns boolean.
 */
export async function checkParentalControl(accountId) {
  const account = db.getSteamAccount(accountId);
  if (!account) throw new Error('Аккаунт не найден');
  return !!account.has_parental_control;
}

/**
 * Получает список игр из библиотеки Steam аккаунта с информацией о часах
 * @param {number} accountId - ID аккаунта из БД
 * @param {boolean} forceRefresh - Принудительное обновление кеша
 * @returns {Promise<Array>} - Список игр с названиями и часами
 */
export async function getOwnedGamesWithHours(accountId, forceRefresh = false) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  const steamId64 = getSteamId64FromAccount(account);
  
  // Проверяем кеш
  if (!forceRefresh) {
    const cache = readGameCache(steamId64);
    if (cache && cache.libraryWithHours) {
      console.log(`[CACHE] Использую кеш библиотеки с часами для ${account.account_name}`);
      return cache.libraryWithHours;
    }
  }

  // Получаем обычную библиотеку
  const library = await getOwnedGames(accountId, 0, 15, forceRefresh);
  
  // Пытаемся получить часы из топ игр
  let gamesWithHours = library.map(game => ({
    ...game,
    playtime_forever: 0
  }));
  
  try {
    const topPlayed = await getTopPlayedGames(accountId, forceRefresh);
    
    // Объединяем данные
    gamesWithHours = library.map(game => {
      const topGame = topPlayed.find(t => t.appId === game.appId);
      return {
        ...game,
        playtime_forever: topGame ? topGame.playtime_forever : 0
      };
    });
    
    // Сохраняем в кеш
    const cache = readGameCache(steamId64) || {};
    cache.libraryWithHours = gamesWithHours;
    writeGameCache(steamId64, cache.library || library, cache.topPlayed || topPlayed);
    
  } catch (err) {
    console.error('Ошибка получения часов для библиотеки:', err.message);
  }
  
  return gamesWithHours;
}
export async function getOwnedGames(accountId, offset = 0, limit = 15, forceRefresh = false) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  // Проверяем блокировку - если уже идет запрос для этого аккаунта
  if (accountLocks.has(accountId)) {
    console.log(`[steamLibrary] Ожидание завершения текущего запроса для ${account.account_name}`);
    return accountLocks.get(accountId);
  }

  const steamId64 = getSteamId64FromAccount(account);
  
  // Проверяем кеш если не форсируем обновление
  if (!forceRefresh) {
    const cache = readGameCache(steamId64);
    if (cache && cache.library) {
      console.log(`[steamLibrary] Использую кеш для ${account.account_name}`);
      return cache.library;
    }
  }

  // Создаем промис для блокировки одновременных запросов
  const fetchPromise = new Promise((resolve, reject) => {
    const client = new SteamUser({
      autoRelogin: false,
      promptSteamGuard: false
    });
    let gamesData = [];
    let licensesReceived = false;

    // Таймаут 20 минут для больших библиотек
    const timeout = setTimeout(() => {
      client.logOff();
      accountLocks.delete(accountId);
      reject(new Error('Таймаут получения списка игр (20 мин). Попробуйте снова.'));
    }, 1200000);

    // Событие получения лицензий
    client.on('licenses', async (licenses) => {
      if (licensesReceived) return;
      licensesReceived = true;

      try {
        console.log(`Получено лицензий: ${licenses.length}`);
        
        if (licenses.length === 0) {
          clearTimeout(timeout);
          client.logOff();
          reject(new Error('Библиотека пуста. Возможно, требуется родительский пароль или аккаунт не имеет игр.'));
          return;
        }

        // Собираем AppID из всех лицензий (с ограничением для оптимизации)
        const appIds = new Set();
        const maxLicenses = Math.min(licenses.length, 100); // Ограничиваем до 100 лицензий
        const BATCH_SIZE = 10; // Обрабатываем по 10 лицензий за раз
        
        console.log(`Обрабатываю ${maxLicenses} из ${licenses.length} лицензий...`);
        
        for (let i = 0; i < maxLicenses; i += BATCH_SIZE) {
          const batch = licenses.slice(i, Math.min(i + BATCH_SIZE, maxLicenses));
          
          await Promise.all(batch.map(async (license) => {
            if (license.package_id) {
              try {
                const packageInfo = await client.getProductInfo([], [license.package_id], true);
                
                if (packageInfo.packages && packageInfo.packages[license.package_id]) {
                  const pkg = packageInfo.packages[license.package_id].packageinfo;
                  
                  if (pkg && pkg.appids) {
                    Object.values(pkg.appids).forEach(appId => {
                      if (typeof appId === 'number') {
                        appIds.add(appId);
                      }
                    });
                  }
                }
              } catch (err) {
                // Игнорируем ошибки отдельных пакетов
              }
            }
          }));
          
          // Небольшая пауза между батчами для снижения нагрузки
          if (i + BATCH_SIZE < maxLicenses) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        console.log(`Найдено уникальных AppID: ${appIds.size}`);
        
        if (appIds.size === 0) {
          console.log('⚠️ Не удалось извлечь игры из лицензий, возвращаю пустой список');
          clearTimeout(timeout);
          client.logOff();
          accountLocks.delete(accountId);
          
          // Возвращаем пустой массив вместо ошибки
          resolve([]);
          return;
        }

        // Получаем информацию о всех приложениях
        const appIdsArray = Array.from(appIds);
        
        console.log(`Получаю информацию о ${appIdsArray.length} играх...`);
        
        try {
          const appsInfo = await client.getProductInfo(appIdsArray, [], true);
          
          if (appsInfo.apps) {
            for (const [appId, appData] of Object.entries(appsInfo.apps)) {
              if (appData.appinfo && appData.appinfo.common) {
                const name = appData.appinfo.common.name;
                const type = appData.appinfo.common.type;
                
                // Фильтруем только игры
                if (type === 'game' || type === 'Game') {
                  gamesData.push({
                    appId: parseInt(appId),
                    name: name || `App ${appId}`
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error('Ошибка получения информации о приложениях:', err.message);
        }

        // Сортируем по названию
        gamesData.sort((a, b) => a.name.localeCompare(b.name));

        console.log(`Загружено игр: ${gamesData.length}`);

        // Сохраняем в кеш
        writeGameCache(steamId64, gamesData, []);

        clearTimeout(timeout);
        client.logOff();
        accountLocks.delete(accountId);
        
        if (gamesData.length === 0) {
          reject(new Error('Не найдено игр в библиотеке. Возможно, все приложения не являются играми.'));
        } else {
          resolve(gamesData);
        }
      } catch (error) {
        clearTimeout(timeout);
        client.logOff();
        accountLocks.delete(accountId);
        reject(error);
      }
    });

    client.on('loggedOn', (details) => {
      console.log(`Получаю библиотеку для ${account.account_name}...`);
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      accountLocks.delete(accountId);
      // If session is replaced, it's because another login is active
      if (err.message === 'LogonSessionReplaced') {
        reject(new Error('Другая сессия уже активна. Попробуйте позже или перезапустите фарм.'));
      } else {
        reject(new Error(`Ошибка Steam: ${err.message}`));
      }
    });

    // Авторизуемся
    client.logOn({
      refreshToken: account.refresh_token
    });
  });

  // Сохраняем промис в блокировку
  accountLocks.set(accountId, fetchPromise);

  // Удаляем блокировку после завершения
  fetchPromise.finally(() => {
    accountLocks.delete(accountId);
  });

  return fetchPromise;
}

/**
 * Получает информацию об игре по App ID
 * @param {number} appId - App ID игры
 * @returns {Promise<Object>} - Объект с информацией об игре
 */
export async function getGameInfo(appId) {
  try {
    // Пробуем получить информацию из Steam Store API
    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=russian`);
    const data = await response.json();
    
    if (data[appId] && data[appId].success && data[appId].data) {
      return {
        appId: appId,
        name: data[appId].data.name || `App ${appId}`,
        type: data[appId].data.type || 'game'
      };
    }
    
    // Если не удалось получить из Store API, возвращаем базовую информацию
    return {
      appId: appId,
      name: `App ${appId}`,
      type: 'game'
    };
  } catch (error) {
    console.error(`Ошибка получения информации об игре ${appId}:`, error.message);
    return {
      appId: appId,
      name: `App ${appId}`,
      type: 'game'
    };
  }
}