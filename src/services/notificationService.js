import bot from '../bot.js';
import * as db from '../database.js';

/**
 * Отправляет уведомление пользователю
 */
export async function sendNotification(userId, type, message) {
  const settings = db.getNotificationSettings(userId);
  const setting = settings.find(s => s.type === type);
  
  if (!setting || !setting.enabled) {
    return; // Уведомления отключены
  }
  
  try {
    await bot.telegram.sendMessage(userId, message);
  } catch (err) {
    console.error(`Ошибка отправки уведомления ${type} пользователю ${userId}:`, err.message);
  }
}

/**
 * Проверяет достижение целей и отправляет уведомления
 */
export async function checkGoalsAndNotify() {
  const allAccounts = db.getAllSteamAccounts();
  
  for (const account of allAccounts) {
    const goals = db.getActiveGoals(account.id);
    
    for (const goal of goals) {
      if (goal.completed && goal.current_hours >= goal.target_hours) {
        const gameName = goal.game_id ? 
          db.getGames(account.id).find(g => g.app_id === goal.game_id)?.game_name || 'Общая' 
          : 'Общая';
        
        await sendNotification(
          account.user_id,
          'hours_milestone',
          `🎉 Цель достигнута!\n\n` +
          `Аккаунт: ${account.account_name}\n` +
          `Игра: ${gameName}\n` +
          `Цель: ${goal.target_hours}ч\n` +
          `Нафармлено: ${goal.current_hours.toFixed(1)}ч`
        );
      }
    }
  }
}

/**
 * Отправляет еженедельный отчет
 */
export async function sendWeeklyReport(userId) {
  const accounts = db.getSteamAccounts(userId);
  
  let totalHours = 0;
  let reportText = '📊 Еженедельный отчет\n━━━━━━━━━━━━━━━\n\n';
  
  for (const account of accounts) {
    const stats = db.getFarmStats(account.id, 7);
    const weekHours = stats.reduce((sum, s) => sum + s.hours_farmed, 0);
    totalHours += weekHours;
    
    reportText += `${account.account_name}: ${weekHours.toFixed(1)}ч\n`;
  }
  
  reportText += `\n━━━━━━━━━━━━━━━\n`;
  reportText += `Всего за неделю: ${totalHours.toFixed(1)}ч\n`;
  reportText += `В среднем в день: ${(totalHours / 7).toFixed(1)}ч`;
  
  await sendNotification(userId, 'weekly_report', reportText);
}

/**
 * Проверяет истечение Premium и отправляет уведомления
 */
export async function checkPremiumExpiring() {
  const users = db.getAllUsers();
  const now = Math.floor(Date.now() / 1000);
  const threeDays = 3 * 24 * 60 * 60;
  
  for (const user of users) {
    const info = db.getUserSubscriptionInfo(user.telegram_id);
    
    if (info.isPremium && info.expiresAt - now <= threeDays && info.expiresAt > now) {
      const daysLeft = Math.ceil((info.expiresAt - now) / 86400);
      
      await sendNotification(
        user.telegram_id,
        'premium_expiring',
        `⚠️ Premium истекает!\n\n` +
        `Осталось дней: ${daysLeft}\n` +
        `Продлите подписку, чтобы продолжить фарм без ограничений.`
      );
    }
  }
}

/**
 * Запускает периодические проверки уведомлений
 */
export function startNotificationService() {
  // Проверка целей каждые 10 минут
  setInterval(() => {
    checkGoalsAndNotify().catch(err => {
      console.error('Ошибка проверки целей:', err);
    });
  }, 600000);
  
  // Еженедельный отчет (каждый понедельник в 10:00)
  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 1 && now.getHours() === 10 && now.getMinutes() < 10) {
      const users = db.getAllUsers();
      users.forEach(user => {
        sendWeeklyReport(user.telegram_id).catch(err => {
          console.error('Ошибка отправки отчета:', err);
        });
      });
    }
  }, 600000);
  
  // Проверка истечения Premium каждый день в 12:00
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 12 && now.getMinutes() < 10) {
      checkPremiumExpiring().catch(err => {
        console.error('Ошибка проверки Premium:', err);
      });
    }
  }, 600000);
  
  console.log('✅ Сервис уведомлений запущен');
}
