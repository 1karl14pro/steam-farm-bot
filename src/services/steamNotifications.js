import SteamUser from 'steam-user';
import * as db from '../database.js';
import bot from '../bot.js';

// Хранилище клиентов для уведомлений
const notificationClients = new Map();

/**
 * Запускает отслеживание уведомлений для аккаунта
 * @param {number} accountId - ID аккаунта
 */
export async function startNotificationTracking(accountId) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  // Проверяем, не запущено ли уже отслеживание
  if (notificationClients.has(accountId)) {
    console.log(`[NOTIFICATIONS] Отслеживание уже запущено для ${account.account_name}`);
    return;
  }

  const client = new SteamUser({
    autoRelogin: true
  });

  // Обработчик входа
  client.on('loggedOn', () => {
    console.log(`[NOTIFICATIONS] ${account.account_name} подключен для уведомлений`);
  });

  // Обработчик запросов в друзья
  client.on('friendRelationship', async (steamID, relationship) => {
    // relationship === 2 означает запрос в друзья
    if (relationship === 2) {
      const settings = db.getNotificationSettings(account.user_id);
      const friendRequestSetting = settings.find(s => s.type === 'friend_request');
      
      if (friendRequestSetting && friendRequestSetting.enabled) {
        try {
          await bot.telegram.sendMessage(
            account.user_id,
            `👥 Новый запрос в друзья!\n\n` +
            `Аккаунт: ${account.account_name}\n` +
            `От: ${steamID.getSteamID64()}\n\n` +
            `Откройте Steam для принятия/отклонения.`
          );
        } catch (err) {
          console.error(`[NOTIFICATIONS] Ошибка отправки уведомления:`, err.message);
        }
      }
    }
  });

  // Обработчик предложений обмена
  client.on('tradeOffers', async (count) => {
    if (count > 0) {
      const settings = db.getNotificationSettings(account.user_id);
      const tradeSetting = settings.find(s => s.type === 'trade_offer');
      
      if (tradeSetting && tradeSetting.enabled) {
        try {
          await bot.telegram.sendMessage(
            account.user_id,
            `💼 Новое предложение обмена!\n\n` +
            `Аккаунт: ${account.account_name}\n` +
            `Количество: ${count}\n\n` +
            `Откройте Steam для просмотра.`
          );
        } catch (err) {
          console.error(`[NOTIFICATIONS] Ошибка отправки уведомления:`, err.message);
        }
      }
    }
  });

  // Обработчик ошибок
  client.on('error', (err) => {
    console.error(`[NOTIFICATIONS] Ошибка ${account.account_name}:`, err.message);
  });

  // Авторизуемся
  try {
    client.logOn({
      refreshToken: account.refresh_token
    });

    notificationClients.set(accountId, {
      client,
      accountName: account.account_name
    });

    console.log(`[NOTIFICATIONS] Запущено отслеживание для ${account.account_name}`);
  } catch (error) {
    console.error(`[NOTIFICATIONS] Ошибка запуска отслеживания:`, error.message);
    throw error;
  }
}

/**
 * Останавливает отслеживание уведомлений для аккаунта
 * @param {number} accountId - ID аккаунта
 */
export function stopNotificationTracking(accountId) {
  const clientData = notificationClients.get(accountId);
  
  if (!clientData) {
    return;
  }

  const { client, accountName } = clientData;
  
  try {
    client.logOff();
    notificationClients.delete(accountId);
    console.log(`[NOTIFICATIONS] Остановлено отслеживание для ${accountName}`);
  } catch (err) {
    console.error(`[NOTIFICATIONS] Ошибка остановки:`, err.message);
  }
}

/**
 * Проверяет, запущено ли отслеживание для аккаунта
 * @param {number} accountId - ID аккаунта
 * @returns {boolean}
 */
export function isTrackingNotifications(accountId) {
  return notificationClients.has(accountId);
}

/**
 * Останавливает все отслеживания
 */
export async function stopAllNotificationTracking() {
  console.log('[NOTIFICATIONS] Остановка всех отслеживаний...');
  
  for (const accountId of notificationClients.keys()) {
    stopNotificationTracking(accountId);
  }
}

/**
 * Запускает отслеживание для всех аккаунтов с включенными уведомлениями
 */
export async function startAllNotificationTracking() {
  const allAccounts = db.getAllSteamAccounts();
  const farmManager = await import('./farmManager.js');
  
  for (const account of allAccounts) {
    // Пропускаем аккаунты которые фармят (у них уже есть активная сессия)
    if (farmManager.isFarming(account.id)) {
      console.log(`[NOTIFICATIONS] Пропускаю ${account.account_name} - активно фармит`);
      continue;
    }
    
    const settings = db.getNotificationSettings(account.user_id);
    
    // Проверяем есть ли хотя бы одно включенное уведомление
    const hasEnabledNotifications = settings.some(s => 
      (s.type === 'friend_request' || s.type === 'trade_offer') && s.enabled
    );
    
    if (hasEnabledNotifications) {
      try {
        await startNotificationTracking(account.id);
        // Задержка между запусками
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error(`[NOTIFICATIONS] Ошибка запуска для ${account.account_name}:`, err.message);
      }
    }
  }
  
  console.log(`[NOTIFICATIONS] Запущено отслеживание для ${notificationClients.size} аккаунтов`);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await stopAllNotificationTracking();
});

process.on('SIGTERM', async () => {
  await stopAllNotificationTracking();
});
