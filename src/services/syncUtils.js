/**
 * Утилиты для синхронизации между сервисами
 */

import * as db from '../database.js';

/**
 * Проверяет согласованность состояния между БД и активными сессиями
 * @param {Function} getClientFunc - Функция получения клиента из farmManager
 * @returns {Object} - Результат проверки
 */
export function checkServiceSync(getClientFunc) {
  const result = {
    inconsistencies: [],
    totalAccounts: 0,
    syncedAccounts: 0,
    desyncedAccounts: 0
  };

  try {
    // Получаем все аккаунты из БД
    const accounts = db.getAllSteamAccounts();
    result.totalAccounts = accounts.length;

    for (const account of accounts) {
      const isInDbFarming = account.is_farming === 1;
      const isClientActive = getClientFunc ? getClientFunc(account.id) !== null : false;

      if (isInDbFarming !== isClientActive) {
        result.inconsistencies.push({
          accountId: account.id,
          accountName: account.account_name,
          dbState: isInDbFarming ? 'farming' : 'stopped',
          clientState: isClientActive ? 'active' : 'inactive',
          issue: 'state_mismatch'
        });
        result.desyncedAccounts++;
      } else {
        result.syncedAccounts++;
      }
    }

    return result;
  } catch (error) {
    console.error('❌ Ошибка проверки синхронизации сервисов:', error.message);
    return {
      ...result,
      error: error.message
    };
  }
}

/**
 * Восстанавливает синхронизацию между БД и активными сессиями
 * @param {Function} startFarmingFunc - Функция запуска фарма из farmManager
 * @param {Function} stopFarmingFunc - Функция остановки фарма из farmManager
 * @param {Function} isFarmingFunc - Функция проверки фарма из farmManager
 */
export async function syncServices(startFarmingFunc, stopFarmingFunc, isFarmingFunc) {
  try {
    const accounts = db.getAllSteamAccounts();
    const fixes = [];

    for (const account of accounts) {
      const expectedToBeFarming = account.is_farming === 1;
      const actuallyFarming = isFarmingFunc(account.id);

      if (expectedToBeFarming && !actuallyFarming) {
        // В БД стоит, что фармим, но на самом деле нет - запускаем
        try {
          await startFarmingFunc(account.id);
          fixes.push({
            accountId: account.id,
            action: 'started_missing_farm',
            message: `Запущен фарм для ${account.account_name} (был в БД как фармящийся)`
          });
        } catch (error) {
          fixes.push({
            accountId: account.id,
            action: 'failed_to_start',
            message: `Не удалось запустить фарм для ${account.account_name}: ${error.message}`
          });
        }
      } else if (!expectedToBeFarming && actuallyFarming) {
        // В БД стоит, что не фармим, но на самом деле да - останавливаем
        try {
          await stopFarmingFunc(account.id);
          fixes.push({
            accountId: account.id,
            action: 'stopped_extra_farm',
            message: `Остановлен фарм для ${account.account_name} (был активен, но не должен был)`
          });
        } catch (error) {
          fixes.push({
            accountId: account.id,
            action: 'failed_to_stop',
            message: `Не удалось остановить фарм для ${account.account_name}: ${error.message}`
          });
        }
      }
    }

    return fixes;
  } catch (error) {
    console.error('❌ Ошибка синхронизации сервисов:', error.message);
    throw error;
  }
}

/**
 * Проверяет здоровье сервисов
 * @returns {Object} - Статус здоровья
 */
export function checkServiceHealth() {
  try {
    // Проверяем доступность БД
    const dbStatus = checkDatabaseHealth();
    
    // Проверяем количество активных фармов
    const activeFarms = db.getFarmingAccounts();
    
    // Проверяем последние команды
    const pendingCommands = db.getPendingFarmCommands();
    
    return {
      db: dbStatus,
      activeFarms: activeFarms.length,
      pendingCommands: pendingCommands.length,
      timestamp: Date.now(),
      healthy: dbStatus.ok && pendingCommands.length < 100 // Если более 100 команд в очереди - возможно проблемы
    };
  } catch (error) {
    return {
      error: error.message,
      healthy: false,
      timestamp: Date.now()
    };
  }
}

/**
 * Проверяет здоровье базы данных
 * @returns {Object} - Статус БД
 */
function checkDatabaseHealth() {
  try {
    const usersCount = db.getAllUsers().length;
    const accountsCount = db.getAllSteamAccounts().length;
    const commandsCount = db.getPendingFarmCommands().length;
    
    return {
      ok: true,
      users: usersCount,
      accounts: accountsCount,
      pendingCommands: commandsCount,
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Записывает состояние синхронизации в лог
 */
export function logSyncStatus(syncResult) {
  if (syncResult.error) {
    console.error('❌ Ошибка проверки синхронизации:', syncResult.error);
    return;
  }

  if (syncResult.inconsistencies.length > 0) {
    console.warn(`⚠️ Обнаружено ${syncResult.inconsistencies.length} несоответствий синхронизации:`);
    syncResult.inconsistencies.forEach(issue => {
      console.warn(`  - Аккаунт ${issue.accountName} (${issue.accountId}): БД=${issue.dbState}, Сервис=${issue.clientState}`);
    });
  } else {
    console.log(`✅ Синхронизация в порядке: ${syncResult.syncedAccounts}/${syncResult.totalAccounts} аккаунтов синхронизированы`);
  }
}