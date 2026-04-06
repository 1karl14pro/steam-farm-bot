import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, '..', 'database.db'));

// Включаем WAL режим для лучшей производительности
db.pragma('journal_mode = WAL');

// Migration: ensure compatibility with newer schema
try {
  const tableInfo = db.prepare("PRAGMA table_info(steam_accounts)").all();
  const hasLibraryCachedAt = tableInfo.find((col) => col.name === 'library_cached_at');
  if (!hasLibraryCachedAt) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN library_cached_at INTEGER DEFAULT 0");
  }

  const hasFarmingStartedAt = tableInfo.find((col) => col.name === 'farming_started_at');
  if (!hasFarmingStartedAt) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN farming_started_at INTEGER DEFAULT 0");
  }

  const hasTotalHoursFarmed = tableInfo.find((col) => col.name === 'total_hours_farmed');
  if (!hasTotalHoursFarmed) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN total_hours_farmed REAL DEFAULT 0");
  }

  const hasCustomStatus = tableInfo.find((col) => col.name === 'custom_status');
  if (!hasCustomStatus) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN custom_status TEXT DEFAULT NULL");
  }

  const hasVisibilityMode = tableInfo.find((col) => col.name === 'visibility_mode');
  if (!hasVisibilityMode) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN visibility_mode INTEGER DEFAULT 0");
  }

  const hasFamilyPin = tableInfo.find((col) => col.name === 'family_pin');
  if (!hasFamilyPin) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN family_pin TEXT DEFAULT NULL");
  }

  const hasPausedByUser = tableInfo.find((col) => col.name === 'paused_by_user');
  if (!hasPausedByUser) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN paused_by_user INTEGER DEFAULT 0");
  }

  const hasSteamPaused = tableInfo.find((col) => col.name === 'steam_paused');
  if (!hasSteamPaused) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN steam_paused INTEGER DEFAULT 0");
  }

  const usersTableInfo = db.prepare("PRAGMA table_info(users)").all();
  const hasReferredBy = usersTableInfo.find((col) => col.name === 'referred_by');
  if (!hasReferredBy) {
    db.exec("ALTER TABLE users ADD COLUMN referred_by INTEGER DEFAULT NULL");
  }

  const hasPremiumTier = usersTableInfo.find((col) => col.name === 'premium_tier');
  if (!hasPremiumTier) {
    db.exec("ALTER TABLE users ADD COLUMN premium_tier INTEGER DEFAULT 0");
  }

  const hasPremiumExpiresAt = usersTableInfo.find((col) => col.name === 'premium_expires_at');
  if (!hasPremiumExpiresAt) {
    db.exec("ALTER TABLE users ADD COLUMN premium_expires_at INTEGER DEFAULT 0");
  }

  const hasBanned = usersTableInfo.find((col) => col.name === 'is_banned');
  if (!hasBanned) {
    db.exec("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0");
  }

} catch (err) {
  // Migration failures are non-fatal; DB may already be migrated
}

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    is_premium INTEGER DEFAULT 0,
    premium_tier INTEGER DEFAULT 0,
    premium_expires_at INTEGER DEFAULT 0,
    trial_ends_at INTEGER,
    referred_by INTEGER DEFAULT NULL,
    is_banned INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS steam_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_name TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    is_farming INTEGER DEFAULT 0,
    has_parental_control INTEGER DEFAULT 0,
    library_cached_at INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    app_id INTEGER NOT NULL,
    game_name TEXT,
    added_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (account_id) REFERENCES steam_accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, app_id)
  );

  CREATE TABLE IF NOT EXISTS library_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    app_id INTEGER NOT NULL,
    game_name TEXT NOT NULL,
    cached_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (account_id) REFERENCES steam_accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, app_id)
  );

  CREATE INDEX IF NOT EXISTS idx_steam_accounts_user ON steam_accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_games_account ON games(account_id);
  CREATE INDEX IF NOT EXISTS idx_library_cache_account ON library_cache(account_id);

  CREATE TABLE IF NOT EXISTS pending_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tier INTEGER NOT NULL,
    method TEXT NOT NULL,
    amount TEXT,
    proof_file_id TEXT,
    comment TEXT,
    status TEXT DEFAULT 'pending',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

// ===== USERS =====
export const getUser = (telegramId) => {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
};

export const createUser = (telegramId, username) => {
  const trialEndsAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 дней
  return db.prepare(`
    INSERT INTO users (telegram_id, username, trial_ends_at)
    VALUES (?, ?, ?)
  `).run(telegramId, username, trialEndsAt);
};

export const updateUserPremium = (telegramId, isPremium) => {
  return db.prepare('UPDATE users SET is_premium = ? WHERE telegram_id = ?')
    .run(isPremium ? 1 : 0, telegramId);
};

export const isUserActive = (telegramId) => {
  const user = getUser(telegramId);
  if (!user || user.is_banned === 1) return false;
  
  const now = Math.floor(Date.now() / 1000);
  const hasPremium = user.premium_expires_at > now;
  const hasTrial = user.trial_ends_at && user.trial_ends_at > now;
  return hasPremium || hasTrial;
};

export const getAccountLimit = (telegramId) => {
  const user = getUser(telegramId);
  if (!user || user.is_banned === 1) return 0;
  
  const now = Math.floor(Date.now() / 1000);
  
  if (user.premium_expires_at > now) {
    return user.premium_tier === 2 ? -1 : 30;
  }
  
  if (user.trial_ends_at && user.trial_ends_at > now) {
    return 5;
  }
  
  return 5;
  
  return 0;
};

export const getUserSubscriptionInfo = (telegramId) => {
  const user = getUser(telegramId);
  if (!user) return { tier: 0, expiresAt: 0, trialEndsAt: 0, isActive: false };
  
  const now = Math.floor(Date.now() / 1000);
  const hasPremium = user.premium_expires_at > now;
  const hasTrial = user.trial_ends_at && user.trial_ends_at > now;
  
  return {
    tier: user.premium_tier,
    expiresAt: user.premium_expires_at,
    trialEndsAt: user.trial_ends_at || 0,
    isActive: hasPremium || hasTrial,
    isPremium: !!hasPremium,
    isTrial: hasTrial && !hasPremium,
    isBanned: user.is_banned === 1
  };
};

export const setUserPremium = (telegramId, tier, days) => {
  const user = getUser(telegramId);
  if (!user) return false;
  
  const now = Math.floor(Date.now() / 1000);
  const daysMs = days * 24 * 60 * 60;
  
  let newExpires;
  if (user.premium_expires_at > now) {
    newExpires = user.premium_expires_at + daysMs;
  } else {
    newExpires = now + daysMs;
  }
  
  db.prepare('UPDATE users SET premium_tier = ?, premium_expires_at = ?, is_premium = 1 WHERE telegram_id = ?')
    .run(tier, newExpires, telegramId);
  return true;
};

export const banUser = (telegramId, banned) => {
  return db.prepare('UPDATE users SET is_banned = ? WHERE telegram_id = ?').run(banned ? 1 : 0, telegramId);
};

export const getAllUsers = () => {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
};

export const getUserByTelegramId = (telegramId) => {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
};

// ===== REFERRALS =====
export const getReferralCount = (telegramId) => {
  return db.prepare('SELECT COUNT(*) as count FROM users WHERE referred_by = ?').get(telegramId).count;
};

export const setUserReferredBy = (telegramId, referrerId) => {
  return db.prepare('UPDATE users SET referred_by = ? WHERE telegram_id = ?').run(referrerId, telegramId);
};

export const addReferralDays = (telegramId, days) => {
  const user = getUser(telegramId);
  if (!user) return false;
  
  const now = Math.floor(Date.now() / 1000);
  const currentEnd = user.trial_ends_at || now;
  const newEnd = Math.max(currentEnd, now) + (days * 24 * 60 * 60);
  
  db.prepare('UPDATE users SET trial_ends_at = ? WHERE telegram_id = ?').run(newEnd, telegramId);
  return true;
};

// ===== STEAM ACCOUNTS =====
export const getSteamAccounts = (userId) => {
  return db.prepare('SELECT * FROM steam_accounts WHERE user_id = ?').all(userId);
};

export const getAllSteamAccounts = () => {
  return db.prepare('SELECT * FROM steam_accounts').all();
};

export const getSteamAccount = (accountId) => {
  return db.prepare('SELECT * FROM steam_accounts WHERE id = ?').get(accountId);
};

export const createSteamAccount = (userId, accountName, refreshToken) => {
  return db.prepare(`
    INSERT INTO steam_accounts (user_id, account_name, refresh_token)
    VALUES (?, ?, ?)
  `).run(userId, accountName, refreshToken);
};

export const updateAccountFarmingStatus = (accountId, isFarming) => {
  return db.prepare('UPDATE steam_accounts SET is_farming = ? WHERE id = ?')
    .run(isFarming ? 1 : 0, accountId);
};

export const updateParentalControlStatus = (accountId, hasControl) => {
  return db.prepare('UPDATE steam_accounts SET has_parental_control = ? WHERE id = ?')
    .run(hasControl ? 1 : 0, accountId);
};

export const deleteSteamAccount = (accountId) => {
  return db.prepare('DELETE FROM steam_accounts WHERE id = ?').run(accountId);
};

export const getFarmingAccounts = () => {
  return db.prepare('SELECT * FROM steam_accounts WHERE is_farming = 1').all();
};

// ===== GAMES =====
export const getGames = (accountId) => {
  return db.prepare('SELECT * FROM games WHERE account_id = ?').all(accountId);
};

export const addGame = (accountId, appId, gameName = null) => {
  try {
    return db.prepare(`
      INSERT INTO games (account_id, app_id, game_name)
      VALUES (?, ?, ?)
    `).run(accountId, appId, gameName);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT') {
      return null; // Игра уже добавлена
    }
    throw err;
  }
};

export const removeGame = (accountId, appId) => {
  return db.prepare('DELETE FROM games WHERE account_id = ? AND app_id = ?')
    .run(accountId, appId);
};

export const clearGames = (accountId) => {
  const result = db.prepare('DELETE FROM games WHERE account_id = ?').run(accountId);
  return result;
};

// ===== LIBRARY CACHE =====
export const getCachedLibrary = (accountId) => {
  return db.prepare('SELECT * FROM library_cache WHERE account_id = ? ORDER BY game_name').all(accountId);
};

export const saveCachedLibrary = (accountId, games) => {
  // Очищаем старый кеш
  db.prepare('DELETE FROM library_cache WHERE account_id = ?').run(accountId);
  
  // Сохраняем новый
  const insert = db.prepare(`
    INSERT INTO library_cache (account_id, app_id, game_name)
    VALUES (?, ?, ?)
  `);
  
  const insertMany = db.transaction((games) => {
    for (const game of games) {
      insert.run(accountId, game.appId, game.name);
    }
  });
  
  insertMany(games);
  
  // Обновляем время кеширования
  db.prepare('UPDATE steam_accounts SET library_cached_at = ? WHERE id = ?')
    .run(Math.floor(Date.now() / 1000), accountId);
};

export const clearCachedLibrary = (accountId) => {
  db.prepare('DELETE FROM library_cache WHERE account_id = ?').run(accountId);
  db.prepare('UPDATE steam_accounts SET library_cached_at = 0 WHERE id = ?').run(accountId);
};

export const getLibraryCacheTime = (accountId) => {
  const account = db.prepare('SELECT library_cached_at FROM steam_accounts WHERE id = ?').get(accountId);
  return account?.library_cached_at || 0;
};

export const setFarmingStartedAt = (accountId, startedAt) => {
  return db.prepare('UPDATE steam_accounts SET farming_started_at = ? WHERE id = ?').run(startedAt, accountId);
};

export const finalizeFarming = (accountId, hoursToAdd) => {
  const account = db.prepare('SELECT total_hours_farmed FROM steam_accounts WHERE id = ?').get(accountId);
  const totalHours = (account?.total_hours_farmed ?? 0) + hoursToAdd;
  return db.prepare('UPDATE steam_accounts SET is_farming = 0, farming_started_at = 0, total_hours_farmed = ? WHERE id = ?')
    .run(totalHours, accountId);
};

// ===== CUSTOM STATUS =====
export const updateCustomStatus = (accountId, customStatus) => {
  return db.prepare('UPDATE steam_accounts SET custom_status = ? WHERE id = ?')
    .run(customStatus, accountId);
};

export const getCustomStatus = (accountId) => {
  const account = db.prepare('SELECT custom_status FROM steam_accounts WHERE id = ?').get(accountId);
  return account?.custom_status || null;
};

// ===== VISIBILITY MODE =====
export const getVisibilityMode = (accountId) => {
  const account = db.prepare('SELECT visibility_mode FROM steam_accounts WHERE id = ?').get(accountId);
  return account?.visibility_mode ?? 0;
};

export const setVisibilityMode = (accountId, mode) => {
  return db.prepare('UPDATE steam_accounts SET visibility_mode = ? WHERE id = ?').run(mode, accountId);
};

// ===== PENDING PAYMENTS =====
export const createPendingPayment = (userId, tier, method, amount, proofFileId, comment) => {
  return db.prepare(`
    INSERT INTO pending_payments (user_id, tier, method, amount, proof_file_id, comment)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, tier, method, amount, proofFileId, comment);
};

export const getPendingPayments = () => {
  return db.prepare('SELECT * FROM pending_payments WHERE status = ? ORDER BY created_at DESC').all('pending');
};

export const getPendingPayment = (id) => {
  return db.prepare('SELECT * FROM pending_payments WHERE id = ?').get(id);
};

export const getUserPendingPayments = (userId) => {
  return db.prepare('SELECT * FROM pending_payments WHERE user_id = ? AND status = ?').all(userId, 'pending');
};

export const approvePayment = (id) => {
  const payment = getPendingPayment(id);
  if (!payment) return false;
  
  db.prepare('UPDATE pending_payments SET status = ? WHERE id = ?').run('approved', id);
  return payment;
};

export const rejectPayment = (id, reason) => {
  db.prepare('UPDATE pending_payments SET status = ? WHERE id = ?').run('rejected', id);
};

// ===== FAMILY PIN =====
export const getFamilyPin = (accountId) => {
  const account = db.prepare('SELECT family_pin FROM steam_accounts WHERE id = ?').get(accountId);
  return account?.family_pin || null;
};

export const setFamilyPin = (accountId, pin) => {
  return db.prepare('UPDATE steam_accounts SET family_pin = ? WHERE id = ?').run(pin, accountId);
};

// ===== PAUSED BY USER =====
export const getPausedByUser = (accountId) => {
  const account = db.prepare('SELECT paused_by_user FROM steam_accounts WHERE id = ?').get(accountId);
  return account?.paused_by_user || 0;
};

export const setPausedByUser = (accountId, paused) => {
  return db.prepare('UPDATE steam_accounts SET paused_by_user = ? WHERE id = ?').run(paused ? 1 : 0, accountId);
};

// ===== PAUSED BY STEAM (game running on PC) =====
export const getSteamPaused = (accountId) => {
  const account = db.prepare('SELECT steam_paused FROM steam_accounts WHERE id = ?').get(accountId);
  return account?.steam_paused || 0;
};

export const setSteamPaused = (accountId, paused) => {
  return db.prepare('UPDATE steam_accounts SET steam_paused = ? WHERE id = ?').run(paused ? 1 : 0, accountId);
};

// ===== DATABASE OPTIMIZATION =====

/**
 * Оптимизирует базу данных (VACUUM + ANALYZE)
 */
export const optimizeDatabase = () => {
  console.log('🔧 Оптимизация базы данных...');
  db.exec('VACUUM');
  db.exec('ANALYZE');
  console.log('✅ База данных оптимизирована');
};

/**
 * Очищает старые данные (платежи старше 30 дней)
 */
export const cleanupOldData = () => {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  
  const result = db.prepare(`
    DELETE FROM pending_payments 
    WHERE created_at < ? AND status != 'pending'
  `).run(thirtyDaysAgo);
  
  if (result.changes > 0) {
    console.log(`🗑 Удалено ${result.changes} старых платежей`);
  }
  
  return result.changes;
};

/**
 * Получает размер базы данных в байтах
 */
export const getDatabaseSize = () => {
  const result = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get();
  return result.size;
};

/**
 * Запускает автоматическую оптимизацию БД (раз в день)
 */
export const startDatabaseMaintenance = () => {
  // Первая оптимизация при запуске
  setTimeout(() => {
    try {
      cleanupOldData();
      optimizeDatabase();
    } catch (err) {
      console.error('❌ Ошибка оптимизации БД:', err.message);
    }
  }, 60000); // Через минуту после запуска
  
  // Регулярная оптимизация каждые 24 часа
  setInterval(() => {
    try {
      cleanupOldData();
      optimizeDatabase();
      
      const size = getDatabaseSize();
      console.log(`📊 Размер БД: ${(size / 1024 / 1024).toFixed(2)} МБ`);
    } catch (err) {
      console.error('❌ Ошибка оптимизации БД:', err.message);
    }
  }, 86400000); // 24 часа
  
  console.log('✅ Автоматическая оптимизация БД запущена');
};

export default db;
