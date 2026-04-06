import * as db from '../database.js';
import * as farmManager from './farmManager.js';

/**
 * Форматирует информацию об аккаунте с статистикой
 */
export function formatAccountInfo(account, games) {
  const status = account.is_farming ? '🟢 Фармит' : '⚫ Остановлен';
  const farmingTime = account.farming_started_at 
    ? Math.floor((Date.now() / 1000 - account.farming_started_at) / 3600)
    : 0;
  
  let text = `🎮 ${account.account_name}\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `${status}\n`;
  
  if (account.custom_status) {
    text += `💬 "${account.custom_status}"\n`;
  }
  
  if (account.is_farming) {
    const startMs = account.farming_started_at * 1000;
    const mskTime = new Date(startMs + 3 * 60 * 60 * 1000);
    const mskStr = mskTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const mskDate = mskTime.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    text += `━━━━━━━━━━━━━━━\n`;
    text += `🕐 Запущен: ${mskDate} ${mskStr} МСК\n`;
    const visMode = account.visibility_mode === 1 ? '👻 Невидимка' : '🌐 В сети';
    text += `${visMode}\n`;
    text += `⏱ Этот сеанс: ${farmingTime}ч\n`;
  }
  
  text += `━━━━━━━━━━━━━━━\n`;
  const maxGames = db.getGamesLimit(account.user_id);
  text += `🎮 Игр: ${games.length}/${maxGames}\n`;
  
  const currentFarmingTime = account.is_farming && account.farming_started_at
    ? Math.max(0, (Date.now() / 1000 - account.farming_started_at) / 3600)
    : 0;
  const totalTime = account.total_hours_farmed + currentFarmingTime;
  text += `📊 Всего нафармлено: ${totalTime.toFixed(1)}ч\n`;
  
  if (account.has_parental_control) {
    const cachedLibrary = db.getCachedLibrary(account.id);
    if (cachedLibrary.length === 0) {
      text += `🔑 PIN: ⚠️ Не установлен!\n`;
    } else if (account.family_pin) {
      text += `🔑 PIN: ✅ Установлен\n`;
    } else {
      text += `🔑 PIN: ✅ Не требуется\n`;
    }
  }
  
  if (games.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    text += `📋 Список игр:\n`;
    games.forEach((game, idx) => {
      text += `${idx + 1}. ${game.game_name || `App ${game.app_id}`}\n`;
    });
  }
  
  return text;
}

/**
 * Форматирует профиль пользователя с полной статистикой
 */
export function formatUserProfileFull(user, accounts) {
  const now = Math.floor(Date.now() / 1000);
  const farmingAccounts = accounts.filter(a => a.is_farming);
  const totalHours = accounts.reduce((sum, a) => sum + (a.total_hours_farmed || 0), 0);
  const totalGames = accounts.reduce((sum, a) => {
    return sum + (db.getGames(a.id).length);
  }, 0);
  const totalSessions = farmingAccounts.length;

  const info = db.getUserSubscriptionInfo(user.telegram_id);

  let text = `👤 Профиль\n`;
  text += `━━━━━━━━━━━━━━━\n`;

  if (info.isBanned) {
    text += `🚫 Заблокирован\n`;
  } else if (info.isPremium) {
    const secondsLeft = info.expiresAt - now;
    const daysLeft = Math.ceil(secondsLeft / 86400);
    const hoursLeft = Math.floor((secondsLeft % 86400) / 3600);
    const tierLabel = info.tier === 2 ? '⭐ Полный' : '📦 Базовый';
    const limitLabel = info.tier === 2 ? '50' : '15';
    text += `${tierLabel} | ${accounts.length}/${limitLabel} акк.\n`;
    text += `⏱ ${daysLeft}д ${hoursLeft}ч до конца\n`;
  } else if (info.isTrial) {
    const secondsLeft = info.trialEndsAt - now;
    const daysLeft = Math.ceil(secondsLeft / 86400);
    const hoursLeft = Math.floor((secondsLeft % 86400) / 3600);
    text += `🎁 Триал | ${accounts.length}/5 акк.\n`;
    text += `⏱ ${daysLeft}д ${hoursLeft}ч осталось\n`;
  } else {
    text += `❌ Подписка неактивна | ${accounts.length}/0 акк.\n`;
  }

  text += `━━━━━━━━━━━━━━━\n`;
  text += `📡 Фармит: ${totalSessions} из ${accounts.length}\n`;
  text += `📊 Часов нафармлено: ${totalHours.toFixed(1)}ч\n`;
  text += `🎮 Игр в фарме: ${totalGames}\n`;
  text += `━━━━━━━━━━━━━━━\n`;

  if (accounts.length > 0) {
    text += `📋 Аккаунты:\n`;
    accounts.forEach((acc) => {
      const games = db.getGames(acc.id);
      const gamesCount = games.length;
      const hours = (acc.total_hours_farmed || 0).toFixed(1);
      const status = acc.is_farming ? '🟢' : '⚫';
      const vis = acc.visibility_mode === 1 ? ' 👻' : '';
      const session = acc.farming_started_at
        ? ` | ⏱ ${Math.floor((now - acc.farming_started_at) / 3600)}ч`
        : '';
      const custom = acc.custom_status ? ` 💬` : '';
      text += `${status} ${acc.account_name}${vis}${custom}${session} (${hours}ч)\n`;
    });
  }

  text += `━━━━━━━━━━━━━━━\n`;
  text += `🆔 ${user.telegram_id}`;

  return text;
}

/**
 * Форматирует список игр с красивым выводом
 */
export function formatGamesList(games) {
  if (!games || games.length === 0) {
    return '📭 Список игр пуст';
  }

  return games.map((game, idx) => {
    const name = game.game_name || `App ${game.app_id}`;
    return `${idx + 1}. ${name}`;
  }).join('\n');
}


