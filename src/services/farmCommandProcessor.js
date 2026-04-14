import * as db from '../database.js';
import * as farmManager from './farmManager.js';

/**
 * Обработчик команд фарма
 * Читает команды из БД и выполняет их
 */

let isRunning = false;
let processingInterval = null;

/**
 * Запускает обработчик команд
 */
export function startCommandProcessor() {
  if (isRunning) {
    console.log('⚠️ Обработчик команд уже запущен');
    return;
  }

  isRunning = true;
  console.log('🔄 Запуск обработчика команд фарма...');

  // Обрабатываем команды каждые 2 секунды
  processingInterval = setInterval(() => {
    processCommands();
  }, 2000);

  // Очищаем старые команды каждые 10 минут
  setInterval(() => {
    try {
      db.cleanupOldFarmCommands();
    } catch (err) {
      console.error('❌ Ошибка очистки старых команд:', err.message);
    }
  }, 600000);

  console.log('✅ Обработчик команд запущен');
}

/**
 * Останавливает обработчик команд
 */
export function stopCommandProcessor() {
  if (!isRunning) return;

  console.log('🛑 Остановка обработчика команд...');
  
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }

  isRunning = false;
  console.log('✅ Обработчик команд остановлен');
}

// Хранилище команд, которые в данный момент обрабатываются (защита от гонок)
const processingCommands = new Set();

/**
 * Обрабатывает необработанные команды из БД
 */
async function processCommands() {
  try {
    const commands = db.getPendingFarmCommands();
    
    if (commands.length === 0) {
      return;
    }

    console.log(`📋 Обработка ${commands.length} команд...`);

    for (const cmd of commands) {
      // Проверяем, не обрабатывается ли уже команда для этого аккаунта
      if (processingCommands.has(cmd.account_id)) {
        console.log(`⚠️ Пропускаю команду ${cmd.id} для аккаунта ${cmd.account_id} - уже обрабатывается`);
        continue;
      }

      // Добавляем аккаунт в обработку
      processingCommands.add(cmd.account_id);
      
      try {
        await processCommand(cmd);
      } catch (error) {
        console.error(`❌ Ошибка обработки команды ${cmd.id}:`, error.message);
        db.markFarmCommandProcessed(cmd.id, error.message);
      } finally {
        // Удаляем из обработки
        processingCommands.delete(cmd.account_id);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка обработки команд:', error.message);
  }
}

/**
 * Обрабатывает одну команду
 * @param {Object} cmd - Команда из БД
 */
async function processCommand(cmd) {
  const { id, account_id, command } = cmd;
  
  // Двойная проверка существования аккаунта
  const account = db.getSteamAccount(account_id);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  console.log(`▶️ Команда ${command} для аккаунта ${account.account_name} (ID: ${account_id})`);

  // Проверяем, не находится ли аккаунт в процессе остановки (важно для избежания конфликтов)
  if (command !== 'stop' && farmManager.isStopping(account_id)) {
    console.log(`⚠️ Аккаунт ${account.account_name} в процессе остановки, откладываю команду ${command}`);
    // Попробуем снова через 5 секунд
    setTimeout(() => {
      // Проверяем, не обработана ли команда за это время
      const stillPending = db.getPendingFarmCommands().some(c => c.id === id);
      if (stillPending) {
        console.log(`🔄 Повторная обработка команды ${id} для аккаунта ${account_id}`);
        db.markFarmCommandProcessed(id, null); // Снимаем с обработки
        db.createFarmCommand(account_id, command); // Создаем новую команду
      }
    }, 5000);
    return;
  }

  try {
    switch (command) {
      case 'start':
        await farmManager.startFarming(account_id);
        console.log(`✅ Фарм запущен для ${account.account_name}`);
        break;

      case 'stop':
        await farmManager.stopFarming(account_id);
        console.log(`✅ Фарм остановлен для ${account.account_name}`);
        break;

      case 'restart':
        await farmManager.restartFarming(account_id);
        console.log(`✅ Фарм перезапущен для ${account.account_name}`);
        break;

      default:
        throw new Error(`Неизвестная команда: ${command}`);
    }

    // Отмечаем команду как обработанную только при успехе
    db.markFarmCommandProcessed(id, null);
  } catch (error) {
    console.error(`❌ Ошибка выполнения команды ${command} для ${account.account_name}:`, error.message);
    // Отмечаем команду как обработанную с ошибкой
    db.markFarmCommandProcessed(id, error.message);
    throw error; // Перебрасываем ошибку для правильной обработки выше
  }
}

/**
 * Получает статистику обработчика команд
 */
export function getProcessorStats() {
  const pendingCommands = db.getPendingFarmCommands();
  
  return {
    isRunning,
    pendingCommands: pendingCommands.length
  };
}
