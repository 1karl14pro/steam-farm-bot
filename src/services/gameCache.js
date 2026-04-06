import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, '..', '..', 'cache');

// Создаем директорию cache если её нет
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Получает путь к файлу кеша для аккаунта
 * @param {string} steamId64 - Steam ID 64
 * @returns {string} - Путь к файлу кеша
 */
function getCacheFilePath(steamId64) {
  return join(CACHE_DIR, `${steamId64}_game_list.txt`);
}

/**
 * Читает кеш игр из файла
 * @param {string} steamId64 - Steam ID 64
 * @returns {Object|null} - Объект с играми и временем кеширования или null
 */
export function readGameCache(steamId64) {
  const filePath = getCacheFilePath(steamId64);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Проверяем возраст кеша (1 час = 3600000 мс)
    const now = Date.now();
    const cacheAge = now - data.cachedAt;
    
    if (cacheAge > 3600000) {
      console.log(`[CACHE] Кеш для ${steamId64} устарел (${Math.floor(cacheAge / 60000)} мин)`);
      return null;
    }
    
    console.log(`[CACHE] Загружен кеш для ${steamId64} (${data.library.length} игр, ${data.topPlayed.length} топ игр)`);
    return data;
  } catch (err) {
    console.error(`[CACHE] Ошибка чтения кеша для ${steamId64}:`, err.message);
    return null;
  }
}

/**
 * Сохраняет кеш игр в файл
 * @param {string} steamId64 - Steam ID 64
 * @param {Array} library - Список всех игр библиотеки
 * @param {Array} topPlayed - Топ игр по часам
 */
export function writeGameCache(steamId64, library, topPlayed) {
  const filePath = getCacheFilePath(steamId64);
  
  // Создаем библиотеку с часами
  const libraryWithHours = library.map(game => {
    const topGame = topPlayed.find(t => t.appId === game.appId);
    return {
      ...game,
      playtime_forever: topGame ? topGame.playtime_forever : 0
    };
  });
  
  const data = {
    steamId64,
    cachedAt: Date.now(),
    library: library || [],
    topPlayed: topPlayed || [],
    libraryWithHours: libraryWithHours
  };
  
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[CACHE] Сохранен кеш для ${steamId64} (${library.length} игр, ${topPlayed.length} топ игр)`);
  } catch (err) {
    console.error(`[CACHE] Ошибка записи кеша для ${steamId64}:`, err.message);
  }
}

/**
 * Проверяет нужно ли обновить кеш
 * @param {string} steamId64 - Steam ID 64
 * @returns {boolean} - true если кеш нужно обновить
 */
export function shouldUpdateCache(steamId64) {
  const cache = readGameCache(steamId64);
  return cache === null;
}

/**
 * Получает Steam ID 64 из аккаунта
 * @param {Object} account - Объект аккаунта из БД
 * @returns {string|null} - Steam ID 64 или null
 */
export function getSteamId64FromAccount(account) {
  // Попробуем извлечь из refresh_token или других данных
  // Пока возвращаем account_name как fallback
  return account.steam_id_64 || account.account_name;
}

/**
 * Удаляет устаревшие кеши (старше 7 дней)
 */
export async function cleanupOldCaches() {
  if (!existsSync(CACHE_DIR)) return;
  
  const fs = await import('fs/promises');
  const files = await fs.readdir(CACHE_DIR);
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  let cleaned = 0;
  for (const file of files) {
    if (!file.endsWith('_game_list.txt')) continue;
    
    const filePath = join(CACHE_DIR, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.cachedAt < sevenDaysAgo) {
        await fs.unlink(filePath);
        cleaned++;
      }
    } catch (err) {
      // Игнорируем ошибки
    }
  }
  
  if (cleaned > 0) {
    console.log(`[CACHE] Удалено ${cleaned} устаревших кешей`);
  }
}
