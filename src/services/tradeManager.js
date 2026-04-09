/**
 * Модуль для автоматического принятия трейдов
 * Принимает только трейды-подарки (где нам дают предметы, а мы ничего не отдаем)
 */

import TradeOfferManager from 'steam-tradeoffer-manager';
import * as db from '../database.js';

// Хранилище менеджеров трейдов для каждого аккаунта
const tradeManagers = new Map();

/**
 * Инициализирует менеджер трейдов для аккаунта
 * @param {SteamUser} client - Клиент steam-user
 * @param {number} accountId - ID аккаунта
 * @param {string} accountName - Имя аккаунта
 */
export function initTradeManager(client, accountId, accountName) {
  const manager = new TradeOfferManager({
    steam: client,
    language: 'ru',
    pollInterval: 30000 // Проверка каждые 30 секунд
  });

  // Обработчик новых трейдов
  manager.on('newOffer', async (offer) => {
    try {
      console.log(`[TRADE] Новый трейд для ${accountName} (ID: ${offer.id})`);
      
      // Получаем предметы
      const itemsToGive = offer.itemsToGive.length;
      const itemsToReceive = offer.itemsToReceive.length;
      
      console.log(`[TRADE] Отдаем: ${itemsToGive}, Получаем: ${itemsToReceive}`);
      
      // Проверяем настройки автопринятия
      const account = db.getSteamAccount(accountId);
      if (!account) {
        console.log(`[TRADE] Аккаунт ${accountId} не найден`);
        return;
      }
      
      const autoAcceptEnabled = db.getAutoAcceptTrades(accountId);
      
      if (!autoAcceptEnabled) {
        console.log(`[TRADE] Автопринятие отключено для ${accountName}`);
        return;
      }
      
      // Принимаем только если:
      // 1. Нам дают предметы (itemsToReceive > 0)
      // 2. Мы ничего не отдаем (itemsToGive === 0)
      if (itemsToReceive > 0 && itemsToGive === 0) {
        console.log(`[TRADE] Принимаю трейд-подарок для ${accountName}...`);
        
        offer.accept((err, status) => {
          if (err) {
            console.error(`[TRADE] Ошибка принятия трейда:`, err.message);
            
            // Отправляем уведомление об ошибке
            sendTradeNotification(account.user_id, accountName, {
              accepted: false,
              error: err.message,
              itemsReceived: itemsToReceive
            });
          } else {
            console.log(`[TRADE] ✅ Трейд принят для ${accountName}! Статус: ${status}`);
            
            // Отправляем уведомление об успехе
            sendTradeNotification(account.user_id, accountName, {
              accepted: true,
              status: status,
              itemsReceived: itemsToReceive
            });
          }
        });
      } else {
        console.log(`[TRADE] Трейд не является подарком, пропускаю`);
        
        // Уведомляем о новом трейде (не подарок)
        sendTradeNotification(account.user_id, accountName, {
          accepted: false,
          reason: 'not_gift',
          itemsToGive: itemsToGive,
          itemsToReceive: itemsToReceive
        });
      }
    } catch (error) {
      console.error(`[TRADE] Ошибка обработки трейда:`, error);
    }
  });

  // Обработчик ошибок
  manager.on('pollFailure', (err) => {
    console.error(`[TRADE] Ошибка опроса трейдов для ${accountName}:`, err.message);
  });

  tradeManagers.set(accountId, manager);
  console.log(`[TRADE] Менеджер трейдов инициализирован для ${accountName}`);
}

/**
 * Отправляет уведомление о трейде в Telegram
 */
async function sendTradeNotification(userId, accountName, data) {
  try {
    const bot = (await import('../bot.js')).default;
    
    let message = `💼 Трейд для ${accountName}\n\n`;
    
    if (data.accepted) {
      message += `✅ Трейд автоматически принят!\n`;
      message += `📦 Получено предметов: ${data.itemsReceived}\n`;
      message += `Статус: ${data.status}`;
    } else if (data.error) {
      message += `❌ Ошибка принятия трейда\n`;
      message += `Причина: ${data.error}\n`;
      message += `📦 Предметов: ${data.itemsReceived}`;
    } else if (data.reason === 'not_gift') {
      message += `⚠️ Новый трейд (не подарок)\n`;
      message += `📤 Отдаем: ${data.itemsToGive}\n`;
      message += `📥 Получаем: ${data.itemsToReceive}\n\n`;
      message += `Откройте Steam для просмотра.`;
    }
    
    await bot.telegram.sendMessage(userId, message);
  } catch (err) {
    console.error(`[TRADE] Ошибка отправки уведомления:`, err.message);
  }
}

/**
 * Останавливает менеджер трейдов для аккаунта
 */
export function stopTradeManager(accountId) {
  const manager = tradeManagers.get(accountId);
  if (manager) {
    manager.shutdown();
    tradeManagers.delete(accountId);
    console.log(`[TRADE] Менеджер трейдов остановлен для аккаунта ${accountId}`);
  }
}

/**
 * Получает менеджер трейдов для аккаунта
 */
export function getTradeManager(accountId) {
  return tradeManagers.get(accountId);
}

export default {
  initTradeManager,
  stopTradeManager,
  getTradeManager
};
