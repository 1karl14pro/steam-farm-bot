import * as db from '../database.js';
import { shouldUpdateCache, cleanupOldCaches } from './gameCache.js';
import { getOwnedGames, getTopPlayedGames } from './steamLibrary.js';
import * as farmManager from './farmManager.js';

let cacheUpdateInterval = null;

/**
 * Запускает автоматическое обновление кеша каждые 6 часов
 */
export function startCacheAutoUpdate() {
  console.log('🔄 Запуск автообновления кеша игр...');
  
  // Первое обновление через 30 минут после запуска
  setTimeout(() => {
    updateAllCaches().catch(err => {
      console.error('❌ Ошибка первого обновления кеша:', err.message);
    });
  }, 1800000); // 30 минут
  
  // Регулярное обновление каждые 6 часов
  cacheUpdateInterval = setInterval(() => {
    updateAllCaches().catch(err => {
      console.error('❌ Ошибка обновления кеша:', err.message);
    });
  }, 21600000); // 6 часов
  
  // Очистка старых кешей раз в день
  setInterval(() => {
    cleanupOldCaches().catch(err => {
      console.error('❌ Ошибка очистки старых кешей:', err.message);
    });
  }, 86400000); // 24 часа
  
  console.log('✅ Автообновление кеша запущено (каждые 6 часов)');
}

/**
 * Останавливает автообновление кеша
 */
export function stopCacheAutoUpdate() {
  if (cacheUpdateInterval) {
    clearInterval(cacheUpdateInterval);
    cacheUpdateInterval = null;
    console.log('🛑 Автообновление кеша остановлено');
  }
}

/**
 * Обновляет кеш для всех аккаунтов
 */
async function updateAllCaches() {
  console.log('🔄 Начинаю обновление кеша для всех аккаунтов...');
  
  const allAccounts = db.getAllSteamAccounts();
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const account of allAccounts) {
    try {
      // Пропускаем аккаунты, которые активно фармят
      if (farmManager.isFarming(account.id)) {
        console.log(`[CACHE] Пропускаю ${account.account_name} - активно фармит`);
        skipped++;
        continue;
      }
      
      const steamId64 = account.steam_id_64 || account.account_name;
      
      // Проверяем нужно ли обновлять
      if (!shouldUpdateCache(steamId64)) {
        skipped++;
        continue;
      }
      
      console.log(`[CACHE] Обновляю кеш для ${account.account_name}...`);
      
      // Обновляем библиотеку с таймаутом 15 минут (для больших библиотек)
      try {
        const updatePromise = Promise.race([
          getOwnedGames(account.id, 0, 15, true),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Таймаут обновления кеша (15 мин)')), 900000)
          )
        ]);
        
        await updatePromise;
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Обновляем топ игр
        await getTopPlayedGames(account.id, true);
        
        updated++;
      } catch (updateError) {
        console.error(`[CACHE] Ошибка обновления кеша для ${account.account_name}:`, updateError.message);
        errors++;
      }
      
      // Задержка между аккаунтами
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (err) {
      console.error(`[CACHE] Ошибка обновления кеша для ${account.account_name}:`, err.message);
      errors++;
      // Продолжаем обновление других аккаунтов
    }
  }
  
  console.log(`✅ Обновление кеша завершено: обновлено ${updated}, пропущено ${skipped}, ошибок ${errors}`);
}

/**
 * Принудительно обновляет кеш для конкретного аккаунта
 * @param {number} accountId - ID аккаунта
 */
export async function forceUpdateCache(accountId) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }
  
  console.log(`[CACHE] Принудительное обновление кеша для ${account.account_name}...`);
  
  // Обновляем библиотеку
  await getOwnedGames(accountId, 0, 15, true);
  
  // Обновляем топ игр
  await getTopPlayedGames(accountId, true);
  
  console.log(`✅ Кеш обновлен для ${account.account_name}`);
}
