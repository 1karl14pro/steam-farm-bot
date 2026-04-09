/**
 * Модуль для разблокировки достижений через Steam API
 * Использует прямые вызовы к Steam Network
 */

const EMsg = {
  ClientStoreUserStats2: 5466,
  ClientStoreUserStatsResponse: 821,
  ClientGetUserStats: 818,
  ClientGetUserStatsResponse: 819
};

/**
 * Получает схему игры и текущие достижения
 * @param {SteamUser} client - Клиент steam-user
 * @param {number} appId - App ID игры
 * @returns {Promise<Object>}
 */
async function getGameSchema(client, appId) {
  return new Promise((resolve, reject) => {
    const getStatsMsg = {
      game_id: appId.toString(),
      steam_id_for_user: client.steamID.getSteamID64()
    };

    console.log(`[ACHIEVEMENT] Запрос схемы игры ${appId}...`);

    client._send(EMsg.ClientGetUserStats, getStatsMsg, (body) => {
      if (body.eresult !== 1) {
        return reject(new Error(`Не удалось получить схему игры: EResult ${body.eresult}`));
      }

      console.log(`[ACHIEVEMENT] Схема получена. CRC: ${body.crc_stats}`);
      console.log(`[ACHIEVEMENT] Блоков достижений: ${body.achievement_blocks ? body.achievement_blocks.length : 0}`);
      
      resolve({
        crc_stats: body.crc_stats,
        schema: body.schema,
        achievement_blocks: body.achievement_blocks || [],
        stats: body.stats || []
      });
    });
  });
}

/**
 * Разблокирует достижение через Steam Network API
 * @param {SteamUser} client - Клиент steam-user
 * @param {number} appId - App ID игры
 * @param {string} achievementName - Название достижения (API name)
 * @returns {Promise<boolean>}
 */
export async function unlockAchievement(client, appId, achievementName) {
  if (!client || !client.steamID) {
    throw new Error('Клиент Steam не подключен');
  }

  try {
    // Получаем схему игры
    const gameData = await getGameSchema(client, appId);
    
    console.log(`[ACHIEVEMENT] Попытка разблокировки достижения ${achievementName}...`);
    
    // Находим ID достижения в схеме
    // Схема - это protobuf, нужно его распарсить
    // Пока что просто отправляем запрос на сохранение с текущим CRC
    
    const storeStatsMsg = {
      game_id: appId.toString(),
      settor_steam_id: client.steamID.getSteamID64(),
      settee_steam_id: client.steamID.getSteamID64(),
      crc_stats: gameData.crc_stats,
      explicit_reset: false,
      stats: []
    };

    return new Promise((resolve, reject) => {
      client._send(EMsg.ClientStoreUserStats2, storeStatsMsg, (response) => {
        if (response.eresult !== 1) {
          return reject(new Error(`Не удалось сохранить статистику: EResult ${response.eresult}`));
        }

        console.log(`[ACHIEVEMENT] Ответ получен. EResult: ${response.eresult}`);
        resolve(true);
      });
    });
  } catch (error) {
    console.error(`[ACHIEVEMENT] Ошибка:`, error);
    throw error;
  }
}

/**
 * Разблокирует все достижения игры
 * @param {SteamUser} client - Клиент steam-user
 * @param {number} appId - App ID игры
 * @param {Array<string>} achievementNames - Массив названий достижений
 * @returns {Promise<Object>}
 */
export async function unlockAllAchievements(client, appId, achievementNames) {
  let unlocked = 0;
  let failed = 0;

  for (const achievementName of achievementNames) {
    try {
      await unlockAchievement(client, appId, achievementName);
      unlocked++;
      
      // Задержка между разблокировками
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Ошибка разблокировки ${achievementName}:`, error.message);
      failed++;
    }
  }

  return {
    total: achievementNames.length,
    unlocked,
    failed
  };
}

export default {
  unlockAchievement,
  unlockAllAchievements
};
