import * as db from '../database.js';
import * as farmManager from './farmManager.js';

/**
 * Менеджер сессий - работает независимо от бота
 * Сохраняет состояние и восстанавливает сессии при перезапуске
 */

let isRunning = false;
let checkInterval = null;

/**
 * Запускает менеджер сессий
 */
export function startSessionManager() {
  if (isRunning) {
    console.log('⚠️ Менеджер сессий уже запущен');
    return;
  }

  isRunning = true;
  console.log('🔄 Запуск менеджера сессий...');

  // Восстанавливаем все активные сессии из БД
  restoreActiveSessions();

  // Проверяем состояние сессий каждые 10 минут (оптимизация CPU)
  checkInterval = setInterval(() => {
    checkSessions();
  }, 600000);

  console.log('✅ Менеджер сессий запущен');
}

/**
 * Останавливает менеджер сессий
 */
export function stopSessionManager() {
  if (!isRunning) return;

  console.log('🛑 Остановка менеджера сессий...');
  
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }

  isRunning = false;
  console.log('✅ Менеджер сессий остановлен');
}

/**
 * Восстанавливает активные сессии из БД
 */
async function restoreActiveSessions() {
  try {
    const farmingAccounts = db.getFarmingAccounts();
    
    if (farmingAccounts.length === 0) {
      console.log('ℹ️ Нет активных сессий для восстановления');
      return;
    }

    console.log(`📋 Восстановление ${farmingAccounts.length} активных сессий...`);

    for (const account of farmingAccounts) {
      try {
        // Проверяем, не запущена ли уже сессия
        if (farmManager.isFarming(account.id)) {
          console.log(`⏭ ${account.account_name} - уже запущен`);
          continue;
        }
        
        console.log(`▶️ Восстановление фарма для ${account.account_name}...`);
        await farmManager.startFarming(account.id);
        console.log(`✅ ${account.account_name} - фарм восстановлен`);
        
        // Небольшая задержка между запусками
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Ошибка восстановления ${account.account_name}:`, error.message);
        // Обновляем статус в БД
        db.updateAccountFarmingStatus(account.id, false);
      }
    }

    console.log('✅ Восстановление сессий завершено');
  } catch (error) {
    console.error('❌ Ошибка восстановления сессий:', error);
  }
}

/**
 * Проверяет состояние активных сессий
 */
function checkSessions() {
  try {
    const farmingAccounts = db.getFarmingAccounts();
    const activeFarms = farmManager.getActiveFarms();

    // Проверяем, что все сессии из БД действительно активны
    for (const account of farmingAccounts) {
      if (!activeFarms.includes(account.id)) {
        console.log(`⚠️ Сессия ${account.account_name} потеряна, восстанавливаю...`);
        
        farmManager.startFarming(account.id)
          .then(() => {
            console.log(`✅ ${account.account_name} - сессия восстановлена`);
          })
          .catch((err) => {
            console.error(`❌ Не удалось восстановить ${account.account_name}:`, err.message);
          });
      }
    }

    // Проверяем, что нет лишних активных сессий
    for (const accountId of activeFarms) {
      const account = db.getSteamAccount(accountId);
      if (!account || account.is_farming === 0) {
        farmManager.stopFarming(accountId);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка проверки сессий:', error);
  }
}

/**
 * Получает статистику сессий
 */
export function getSessionStats() {
  const farmingAccounts = db.getFarmingAccounts();
  const activeFarms = farmManager.getActiveFarms();

  return {
    totalInDB: farmingAccounts.length,
    totalActive: activeFarms.length,
    isRunning
  };
}

/**
 * Получает cookies для конкретного аккаунта
 * @param {number} accountId - ID аккаунта
 * @returns {Array|null} - массив cookie или null
 */
export function getCookies(accountId) {
  return farmManager.getCookies(accountId);
}

/**
 * Устанавливает cookies для конкретного аккаунта
 * @param {number} accountId - ID аккаунта
 * @param {Array} cookies - массив cookie
 */
export function setCookies(accountId, cookies) {
  farmManager.setAccountCookies(accountId, cookies);
}

/**
 * Удаляет cookies для конкретного аккаунта
 * @param {number} accountId - ID аккаунта
 */
export function removeCookies(accountId) {
  // Удаление cookies происходит автоматически при отключении
  console.warn('warn: removeCookies не реализован для нового менеджера.');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Получен сигнал SIGINT...');
  stopSessionManager();
  await farmManager.stopAllFarming();
});

process.on('SIGTERM', async () => {
  console.log('🛑 Получен сигнал SIGTERM...');
  stopSessionManager();
  await farmManager.stopAllFarming();
});

// Обработка необработанных ошибок
process.on('uncaughtException', (err) => {
  console.error('❌ Необработанная ошибка:', err);
  // Не останавливаем менеджер сессий при ошибках
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанное отклонение промиса:', reason);
  // Не останавливаем менеджер сессий при ошибках
});
