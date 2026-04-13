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
      try {
        await processCommand(cmd);
      } catch (error) {
        console.error(`❌ Ошибка обработки команды ${cmd.id}:`, error.message);
        db.markFarmCommandProcessed(cmd.id, error.message);
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
  
  const account = db.getSteamAccount(account_id);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  console.log(`▶️ Команда ${command} для аккаунта ${account.account_name} (ID: ${account_id})`);

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

  // Отмечаем команду как обработанную
  db.markFarmCommandProcessed(id, null);
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
