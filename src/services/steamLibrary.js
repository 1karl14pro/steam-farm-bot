import SteamUser from 'steam-user';
import { LoginSession, EAuthTokenPlatformType } from 'steam-session';
import * as db from '../database.js';

/**
 * Получает топ-10 игр по времени игры для аккаунта
 * @param {number} accountId - ID аккаунта из БД
 * @returns {Promise<Array>} - Список топ игр с часами игры
 */
export async function getTopPlayedGames(accountId) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  return new Promise((resolve, reject) => {
    const client = new SteamUser();

    // Таймаут 60 секунд
    const timeout = setTimeout(() => {
      client.logOff();
      reject(new Error('Таймаут получения статистики игр (60 сек)'));
    }, 60000);

    client.on('loggedOn', async () => {
      try {
        console.log(`Получаю статистику игр для ${account.account_name}...`);
        
        // Получаем статистику игр через getUserStats
        const stats = await client.getUserStatsForGames([]);
        
        if (!stats || !stats.length) {
          clearTimeout(timeout);
          client.logOff();
          // Fallback к библиотеке если нет статистики
          const libraryGames = await getOwnedGames(accountId);
          resolve(libraryGames.slice(0, 10).map(game => ({
            ...game,
            playtime_forever: 0 // Нет данных о времени игры
          })));
          return;
        }

        // Сортируем по времени игры и берем топ-10
        const topGames = stats
          .filter(game => game.playtime_forever > 0)
          .sort((a, b) => b.playtime_forever - a.playtime_forever)
          .slice(0, 10)
          .map(game => ({
            appId: game.appid,
            name: game.name,
            playtime_forever: game.playtime_forever
          }));

        clearTimeout(timeout);
        client.logOff();
        resolve(topGames.length > 0 ? topGames : []);
      } catch (error) {
        clearTimeout(timeout);
        client.logOff();
        // Fallback к обычной библиотеке при ошибке
        try {
          const libraryGames = await getOwnedGames(accountId);
          resolve(libraryGames.slice(0, 10).map(game => ({
            ...game,
            playtime_forever: 0
          })));
        } catch (fallbackError) {
          reject(fallbackError);
        }
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    // Авторизуемся
    client.logOn({
      refreshToken: account.refresh_token
    });
  });
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
 * Получает список игр из библиотеки Steam аккаунта
 * @param {number} accountId - ID аккаунта из БД
 * @returns {Promise<Array>} - Список игр с названиями
 */
export async function getOwnedGames(accountId, offset = 0, limit = 15) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  return new Promise((resolve, reject) => {
    const client = new SteamUser();
    let gamesData = [];
    let licensesReceived = false;

    // Таймаут 180 секунд для больших библиотек
    const timeout = setTimeout(() => {
      client.logOff();
      reject(new Error('Таймаут получения списка игр (180 сек). Попробуйте снова.'));
    }, 180000);

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
        
        console.log(`Обрабатываю ${maxLicenses} из ${licenses.length} лицензий...`);
        
        for (let i = 0; i < maxLicenses; i++) {
          const license = licenses[i];
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
        }

        console.log(`Найдено уникальных AppID: ${appIds.size}`);
        
        if (appIds.size === 0) {
          clearTimeout(timeout);
          client.logOff();
          reject(new Error('Не удалось извлечь игры из лицензий'));
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

        clearTimeout(timeout);
        client.logOff();
        
        if (gamesData.length === 0) {
          reject(new Error('Не найдено игр в библиотеке. Возможно, все приложения не являются играми.'));
        } else {
          resolve(gamesData);
        }
      } catch (error) {
        clearTimeout(timeout);
        client.logOff();
        reject(error);
      }
    });

    client.on('loggedOn', (details) => {
      console.log(`Получаю библиотеку для ${account.account_name}...`);
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Ошибка Steam: ${err.message}`));
    });

    // Авторизуемся
    client.logOn({
      refreshToken: account.refresh_token
    });
  });
}
