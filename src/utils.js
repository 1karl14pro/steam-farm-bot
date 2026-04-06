export const formatAccountList = (accounts) => {
  if (!accounts || accounts.length === 0) {
    return '📭 У вас пока нет добавленных аккаунтов';
  }

  return accounts.map((acc, idx) => {
    const status = acc.is_farming ? '🟢' : '🔴';
    return `${idx + 1}. ${status} ${acc.account_name}`;
  }).join('\n');
};

export const formatGamesList = (games) => {
  if (!games || games.length === 0) {
    return '📭 Список игр пуст';
  }

  return games.map((game, idx) => {
    const name = game.game_name || `App ${game.app_id}`;
    return `${idx + 1}. ${name} (${game.app_id})`;
  }).join('\n');
};

export const formatUserProfile = (user, accountsCount) => {
  const now = Math.floor(Date.now() / 1000);
  const isPremium = user.is_premium === 1;
  const trialActive = user.trial_ends_at && user.trial_ends_at > now;
  
  let status = '❌ Неактивен';
  if (isPremium) {
    status = '⭐ Premium';
  } else if (trialActive) {
    const daysLeft = Math.ceil((user.trial_ends_at - now) / 86400);
    status = `🎁 Триал (${daysLeft} дн.)`;
  }

  const limit = isPremium ? 10 : 5;

  return `👤 Профиль\n\n` +
    `Статус: ${status}\n` +
    `Аккаунтов: ${accountsCount}/${limit}\n` +
    `Telegram ID: ${user.telegram_id}`;
};

// Функция логирования с timestamp
const log = (prefix, message) => {
  const now = new Date();
  const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${prefix} ${message}`);
};

export const logger = {
  info: (msg) => log('ℹ️', msg),
  success: (msg) => log('✅', msg),
  warning: (msg) => log('⚠️', msg),
  error: (msg) => log('❌', msg),
  start: (msg) => log('🚀', msg),
  stop: (msg) => log('🛑', msg),
  session: (msg) => log('📡', msg),
};

// Хранилище состояний пользователей
export const userStates = {
  states: new Map(),
  set(key, value) {
    this.states.set(key, value);
  },
  get(key) {
    return this.states.get(key);
  },
  delete(key) {
    this.states.delete(key);
  }
};
