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
 * ИСПРАВЛЕНО: Параллельное обновление с ограничением конкурентности
 */
async function updateAllCaches() {
  console.log('🔄 Начинаю обновление кеша для всех аккаунтов...');
  
  const allAccounts = db.getAllSteamAccounts();
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Фильтруем аккаунты, которые нужно обновить
  const accountsToUpdate = [];
  
  for (const account of allAccounts) {
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
    
    accountsToUpdate.push(account);
  }
  
  console.log(`[CACHE] Найдено ${accountsToUpdate.length} аккаунтов для обновления`);
  
  // Обновляем параллельно по 3 аккаунта одновременно
  const CONCURRENCY = 3;
  
  for (let i = 0; i < accountsToUpdate.length; i += CONCURRENCY) {
    const batch = accountsToUpdate.slice(i, i + CONCURRENCY);
    
    const results = await Promise.allSettled(
      batch.map(async (account) => {
        try {
          console.log(`[CACHE] Обновляю кеш для ${account.account_name}...`);
          
          // Обновляем библиотеку с таймаутом 10 минут
          const updatePromise = Promise.race([
            getOwnedGames(account.id, 0, 15, true),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Таймаут обновления кеша (10 мин)')), 600000)
            )
          ]);
          
          await updatePromise;
          
          // Небольшая задержка между запросами
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Обновляем топ игр
          await getTopPlayedGames(account.id, true);
          
          return { success: true, account: account.account_name };
        } catch (error) {
          console.error(`[CACHE] Ошибка обновления кеша для ${account.account_name}:`, error.message);
          return { success: false, account: account.account_name, error: error.message };
        }
      })
    );
    
    // Подсчитываем результаты
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        updated++;
      } else {
        errors++;
      }
    }
    
    // Задержка между батчами (только если есть еще батчи)
    if (i + CONCURRENCY < accountsToUpdate.length) {
      await new Promise(resolve => setTimeout(resolve, 5000));
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
