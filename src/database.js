import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Используем переменную окружения для пути к БД или дефолтный путь
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'database.db');
const db = new Database(DB_PATH);

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

  const hasSteamId64 = tableInfo.find((col) => col.name === 'steam_id_64');
  if (!hasSteamId64) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN steam_id_64 TEXT DEFAULT NULL");
  }

  const hasCustomStatusMode = tableInfo.find((col) => col.name === 'custom_status_mode');
  if (!hasCustomStatusMode) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN custom_status_mode INTEGER DEFAULT 0");
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

  const hasTermsAccepted = usersTableInfo.find((col) => col.name === 'terms_accepted');
  if (!hasTermsAccepted) {
    db.exec("ALTER TABLE users ADD COLUMN terms_accepted INTEGER DEFAULT 0");
  }

  const hasLanguage = usersTableInfo.find((col) => col.name === 'language');
  if (!hasLanguage) {
    db.exec("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'ru'");
  }

  const hasAutoAcceptTrades = tableInfo.find((col) => col.name === 'auto_accept_trades');
  if (!hasAutoAcceptTrades) {
    db.exec("ALTER TABLE steam_accounts ADD COLUMN auto_accept_trades INTEGER DEFAULT 0");
  }

  // Добавляем поля для отслеживания часов в играх
  const gamesTableInfo = db.prepare("PRAGMA table_info(games)").all();
  const hasInitialHours = gamesTableInfo.find((col) => col.name === 'initial_hours');
  if (!hasInitialHours) {
    db.exec("ALTER TABLE games ADD COLUMN initial_hours REAL DEFAULT 0");
  }

  const hasCurrentHours = gamesTableInfo.find((col) => col.name === 'current_hours');
  if (!hasCurrentHours) {
    db.exec("ALTER TABLE games ADD COLUMN current_hours REAL DEFAULT 0");
  }

  const hasLastUpdated = gamesTableInfo.find((col) => col.name === 'last_updated');
  if (!hasLastUpdated) {
    db.exec("ALTER TABLE games ADD COLUMN last_updated INTEGER DEFAULT 0");
  }

  // Очистка дубликатов уведомлений
  try {
    // Удаляем дубликаты, оставляя только первую запись для каждой пары (user_id, type)
    db.exec(`
      DELETE FROM notifications 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM notifications 
        GROUP BY user_id, type
      )
    `);
    console.log('✅ Дубликаты уведомлений удалены');
  } catch (err) {
    console.log('⚠️ Ошибка очистки дубликатов уведомлений:', err.message);
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
  
  -- Новые индексы для оптимизации производительности
  CREATE INDEX IF NOT EXISTS idx_accounts_farming ON steam_accounts(is_farming, user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_type ON notifications(user_id, type);
  CREATE INDEX IF NOT EXISTS idx_farm_stats_account_date ON farm_stats(account_id, date);
  CREATE INDEX IF NOT EXISTS idx_pending_payments_status ON pending_payments(status, user_id);
  
  -- Дополнительные индексы для оптимизации
  CREATE INDEX IF NOT EXISTS idx_games_account_app ON games(account_id, app_id);
  CREATE INDEX IF NOT EXISTS idx_users_premium ON users(premium_expires_at, is_banned);
  CREATE INDEX IF NOT EXISTS idx_accounts_user_farming ON steam_accounts(user_id, is_farming);
  CREATE INDEX IF NOT EXISTS idx_library_cache_app ON library_cache(app_id);
  CREATE INDEX IF NOT EXISTS idx_goals_account_completed ON farm_goals(account_id, completed);

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

  CREATE TABLE IF NOT EXISTS farm_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    hours_farmed REAL DEFAULT 0,
    FOREIGN KEY (account_id) REFERENCES steam_accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, date)
  );

  CREATE TABLE IF NOT EXISTS farm_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    game_id INTEGER,
    target_hours REAL NOT NULL,
    current_hours REAL DEFAULT 0,
    deadline INTEGER,
    completed INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (account_id) REFERENCES steam_accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS farm_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    days_of_week TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    FOREIGN KEY (account_id) REFERENCES steam_accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
    UNIQUE(user_id, type)
  );
`);

// ===== USERS =====
export const getUser = (telegramId) => {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
};

export const createUser = (telegramId, username) => {
  const trialEndsAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 дней
  return db.prepare(`
    INSERT INTO users (telegram_id, username, trial_ends_at, terms_accepted)
    VALUES (?, ?, ?, 0)
  `).run(telegramId, username, trialEndsAt);
};

export const acceptTerms = (telegramId) => {
  return db.prepare('UPDATE users SET terms_accepted = 1 WHERE telegram_id = ?').run(telegramId);
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

// ===== LANGUAGE =====
export const getUserLanguage = (telegramId) => {
  const user = db.prepare('SELECT language FROM users WHERE telegram_id = ?').get(telegramId);
  return user?.language || 'ru';
};

export const setUserLanguage = (telegramId, language) => {
  return db.prepare('UPDATE users SET language = ? WHERE telegram_id = ?')
    .run(language, telegramId);
};

export const getAccountLimit = (telegramId) => {
  const user = getUser(telegramId);
  if (!user || user.is_banned === 1) return 0;
  
  const now = Math.floor(Date.now() / 1000);
  
  if (user.premium_expires_at > now) {
    return user.premium_tier === 2 ? 50 : 15; // Полный: 50, Базовый: 15
  }
  
  if (user.trial_ends_at && user.trial_ends_at > now) {
    return 5;
  }
  
  return 0;
};

export const getGamesLimit = (telegramId) => {
  const user = getUser(telegramId);
  if (!user || user.is_banned === 1) return 0;
  
  const now = Math.floor(Date.now() / 1000);
  
  // Premium пользователи
  if (user.premium_expires_at > now) {
    return user.premium_tier === 2 ? 15 : 10; // Полный: 15, Базовый: 10
  }
  
  // Триал пользователи
  if (user.trial_ends_at && user.trial_ends_at > now) {
    return 4;
  }
  
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

export const getReferrals = (telegramId) => {
  return db.prepare('SELECT telegram_id, created_at FROM users WHERE referred_by = ?').all(telegramId);
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
  return db.prepare('SELECT * FROM steam_accounts WHERE user_id = ? ORDER BY account_name COLLATE NOCASE ASC').all(userId);
};

export const getAllSteamAccounts = () => {
  return db.prepare('SELECT * FROM steam_accounts').all();
};

export const getSteamAccount = (accountId) => {
  return db.prepare('SELECT * FROM steam_accounts WHERE id = ?').get(accountId);
};

export const addSteamAccount = (userId, accountName, password, sharedSecret, identitySecret, refreshToken) => {
  return db.prepare(`
    INSERT INTO steam_accounts (user_id, account_name, refresh_token)
    VALUES (?, ?, ?)
  `).run(userId, accountName, refreshToken).lastInsertRowid;
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

export const addGame = (accountId, appId, gameName = null, initialHours = 0) => {
  // Валидация входных данных
  if (!accountId || accountId <= 0) {
    throw new Error('Некорректный ID аккаунта');
  }
  
  if (!appId || appId <= 0) {
    throw new Error('Некорректный App ID игры');
  }
  
  if (initialHours < 0) {
    console.warn(`[DB] Отрицательное значение initialHours (${initialHours}), устанавливаю 0`);
    initialHours = 0;
  }
  
  if (initialHours > 1000000) {
    console.warn(`[DB] Слишком большое значение initialHours (${initialHours}), устанавливаю 0`);
    initialHours = 0;
  }
  
  try {
    return db.prepare(`
      INSERT INTO games (account_id, app_id, game_name, initial_hours, current_hours, last_updated)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(accountId, appId, gameName, initialHours, initialHours, Math.floor(Date.now() / 1000));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT') {
      return null; // Игра уже добавлена
    }
    throw err;
  }
};

export const removeGame = (accountId, appId) => {
  return db.prepare('DELETE FROM games WHERE account_id = ? AND app_id = ?').run(accountId, appId);
};

/**
 * Обновляет начальные часы для игры (для исправления статистики)
 */
export const updateInitialHours = (accountId, appId, initialHours) => {
  return db.prepare(`
    UPDATE games 
    SET initial_hours = ?, current_hours = ?
    WHERE account_id = ? AND app_id = ?
  `).run(initialHours, initialHours, accountId, appId);
};

export const updateGameHours = (accountId, appId, currentHours) => {
  return db.prepare(`
    UPDATE games 
    SET current_hours = ?, last_updated = ?
    WHERE account_id = ? AND app_id = ?
  `).run(currentHours, Math.floor(Date.now() / 1000), accountId, appId);
};

export const getGameWithHours = (accountId, appId) => {
  return db.prepare(`
    SELECT *, 
           (current_hours - initial_hours) as hours_gained
    FROM games 
    WHERE account_id = ? AND app_id = ?
  `).get(accountId, appId);
};

export const getGamesWithHours = (accountId) => {
  return db.prepare(`
    SELECT *, 
           (current_hours - initial_hours) as hours_gained
    FROM games 
    WHERE account_id = ?
    ORDER BY game_name
  `).all(accountId);
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
export const setCustomStatus = (accountId, customStatus) => {
  return db.prepare('UPDATE steam_accounts SET custom_status = ? WHERE id = ?')
    .run(customStatus, accountId);
};

export const getCustomStatus = (accountId) => {
  const account = db.prepare('SELECT custom_status FROM steam_accounts WHERE id = ?').get(accountId);
  return account?.custom_status || null;
};

// ===== CUSTOM STATUS MODE =====
export const setCustomStatusMode = (accountId, mode) => {
  return db.prepare('UPDATE steam_accounts SET custom_status_mode = ? WHERE id = ?')
    .run(mode, accountId);
};

export const getCustomStatusMode = (accountId) => {
  const account = db.prepare('SELECT custom_status_mode FROM steam_accounts WHERE id = ?').get(accountId);
  return account?.custom_status_mode ?? 0; // 0 = одна игра, 1 = все игры
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

// ===== STEAM ID 64 =====
export const updateSteamId64 = (accountId, steamId64) => {
  return db.prepare('UPDATE steam_accounts SET steam_id_64 = ? WHERE id = ?').run(steamId64, accountId);
};

export const getSteamId64 = (accountId) => {
  const account = db.prepare('SELECT steam_id_64 FROM steam_accounts WHERE id = ?').get(accountId);
  return account?.steam_id_64 || null;
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

// ===== FARM STATISTICS =====

/**
 * Записывает статистику фарма за день
 */
export const recordFarmStats = (accountId, hours) => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  return db.prepare(`
    INSERT INTO farm_stats (account_id, date, hours_farmed)
    VALUES (?, ?, ?)
    ON CONFLICT(account_id, date) 
    DO UPDATE SET hours_farmed = hours_farmed + ?
  `).run(accountId, today, hours, hours);
};

/**
 * Получает статистику за последние N дней
 */
export const getFarmStats = (accountId, days = 7) => {
  return db.prepare(`
    SELECT date, hours_farmed 
    FROM farm_stats 
    WHERE account_id = ? 
    AND date >= date('now', '-${days} days')
    ORDER BY date DESC
  `).all(accountId);
};

/**
 * Получает топ-5 игр по нафармленным часам
 */
export const getTopFarmedGames = (accountId) => {
  // Пока возвращаем из games, позже можно добавить отдельную таблицу
  return db.prepare(`
    SELECT game_name, app_id
    FROM games
    WHERE account_id = ?
    ORDER BY added_at DESC
    LIMIT 5
  `).all(accountId);
};

// ===== FARM GOALS =====

/**
 * Создает цель фарма
 */
export const createFarmGoal = (accountId, gameId, targetHours, deadline) => {
  return db.prepare(`
    INSERT INTO farm_goals (account_id, game_id, target_hours, deadline)
    VALUES (?, ?, ?, ?)
  `).run(accountId, gameId, targetHours, deadline);
};

/**
 * Получает активные цели
 */
export const getActiveGoals = (accountId) => {
  return db.prepare(`
    SELECT * FROM farm_goals
    WHERE account_id = ? AND completed = 0
    ORDER BY deadline ASC
  `).all(accountId);
};

/**
 * Обновляет прогресс цели
 */
export const updateGoalProgress = (goalId, currentHours) => {
  const goal = db.prepare('SELECT target_hours FROM farm_goals WHERE id = ?').get(goalId);
  const completed = currentHours >= goal.target_hours ? 1 : 0;
  
  return db.prepare(`
    UPDATE farm_goals 
    SET current_hours = ?, completed = ?
    WHERE id = ?
  `).run(currentHours, completed, goalId);
};

// ===== FARM SCHEDULES =====

/**
 * Создает расписание фарма
 */
export const createSchedule = (accountId, startTime, endTime, daysOfWeek) => {
  return db.prepare(`
    INSERT INTO farm_schedules (account_id, start_time, end_time, days_of_week)
    VALUES (?, ?, ?, ?)
  `).run(accountId, startTime, endTime, daysOfWeek);
};

/**
 * Получает расписания для аккаунта
 */
export const getSchedules = (accountId) => {
  return db.prepare(`
    SELECT * FROM farm_schedules
    WHERE account_id = ? AND enabled = 1
  `).all(accountId);
};

/**
 * Удаляет расписание
 */
export const deleteSchedule = (scheduleId) => {
  return db.prepare('DELETE FROM farm_schedules WHERE id = ?').run(scheduleId);
};

/**
 * Проверяет должен ли аккаунт фармить сейчас
 */
export const shouldFarmNow = (accountId) => {
  const schedules = getSchedules(accountId);
  if (schedules.length === 0) return true; // Нет расписания = фармить всегда
  
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  for (const schedule of schedules) {
    const days = schedule.days_of_week.split(',').map(Number);
    if (days.includes(currentDay)) {
      if (currentTime >= schedule.start_time && currentTime <= schedule.end_time) {
        return true;
      }
    }
  }
  
  return false;
};

// ===== NOTIFICATIONS =====

/**
 * Создает настройки уведомлений для пользователя
 */
export const initNotifications = (userId) => {
  const types = ['hours_milestone', 'farm_error', 'weekly_report', 'premium_expiring', 'friend_request', 'trade_offer'];
  
  const insert = db.prepare(`
    INSERT OR IGNORE INTO notifications (user_id, type, enabled)
    VALUES (?, ?, 1)
  `);
  
  for (const type of types) {
    insert.run(userId, type);
  }
};

/**
 * Получает настройки уведомлений
 */
export const getNotificationSettings = (userId) => {
  return db.prepare('SELECT * FROM notifications WHERE user_id = ?').all(userId);
};

/**
 * Обновляет настройку уведомления
 */
export const toggleNotification = (userId, type, enabled) => {
  return db.prepare(`
    UPDATE notifications 
    SET enabled = ?
    WHERE user_id = ? AND type = ?
  `).run(enabled ? 1 : 0, userId, type);
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

// ===== LEADERBOARDS / РЕЙТИНГИ =====

/**
 * Получить топ пользователей по часам фарма
 * @param {number} limit - Количество пользователей в топе
 * @returns {Array}
 */
export const getTopUsersByHours = (limit = 10) => {
  return db.prepare(`
    SELECT 
      u.telegram_id,
      u.username,
      SUM(sa.total_hours_farmed) as total_hours,
      COUNT(sa.id) as accounts_count
    FROM users u
    LEFT JOIN steam_accounts sa ON u.telegram_id = sa.user_id
    WHERE u.is_banned = 0
    GROUP BY u.telegram_id
    HAVING total_hours > 0
    ORDER BY total_hours DESC
    LIMIT ?
  `).all(limit);
};

/**
 * Получить топ игр по часам фарма
 * @param {number} limit - Количество игр в топе
 * @returns {Array}
 */
export const getTopGamesByHours = (limit = 10) => {
  return db.prepare(`
    SELECT 
      g.app_id,
      g.game_name,
      COUNT(DISTINCT g.account_id) as accounts_count,
      SUM(fs.hours_farmed) as total_hours
    FROM games g
    LEFT JOIN farm_stats fs ON g.account_id = fs.account_id
    GROUP BY g.app_id, g.game_name
    HAVING total_hours > 0
    ORDER BY total_hours DESC
    LIMIT ?
  `).all(limit);
};

/**
 * Получить топ аккаунтов по часам фарма (анонимно)
 * @param {number} limit - Количество аккаунтов в топе
 * @returns {Array}
 */
export const getTopAccountsByHours = (limit = 10) => {
  return db.prepare(`
    SELECT 
      sa.id,
      sa.total_hours_farmed as total_hours,
      u.username
    FROM steam_accounts sa
    LEFT JOIN users u ON sa.user_id = u.telegram_id
    WHERE u.is_banned = 0 AND sa.total_hours_farmed > 0
    ORDER BY sa.total_hours_farmed DESC
    LIMIT ?
  `).all(limit);
};

/**
 * Получить позицию пользователя в рейтинге
 * @param {number} telegramId
 * @returns {Object}
 */
export const getUserRank = (telegramId) => {
  const result = db.prepare(`
    WITH ranked_users AS (
      SELECT 
        u.telegram_id,
        SUM(sa.total_hours_farmed) as total_hours,
        ROW_NUMBER() OVER (ORDER BY SUM(sa.total_hours_farmed) DESC) as rank
      FROM users u
      LEFT JOIN steam_accounts sa ON u.telegram_id = sa.user_id
      WHERE u.is_banned = 0
      GROUP BY u.telegram_id
      HAVING total_hours > 0
    )
    SELECT rank, total_hours
    FROM ranked_users
    WHERE telegram_id = ?
  `).get(telegramId);
  
  return result || { rank: null, total_hours: 0 };
};

/**
 * Получить общую статистику по всем пользователям
 * @returns {Object}
 */
export const getGlobalStats = () => {
  return db.prepare(`
    SELECT 
      COUNT(DISTINCT u.telegram_id) as total_users,
      COUNT(DISTINCT sa.id) as total_accounts,
      COUNT(DISTINCT g.app_id) as total_games,
      COALESCE(SUM(sa.total_hours_farmed), 0) as total_hours_farmed,
      COUNT(DISTINCT CASE WHEN sa.is_farming = 1 THEN sa.id END) as active_farms
    FROM users u
    LEFT JOIN steam_accounts sa ON u.telegram_id = sa.user_id
    LEFT JOIN games g ON sa.id = g.account_id
    WHERE u.is_banned = 0
  `).get();
};

/**
 * Включить/выключить автопринятие трейдов для аккаунта
 * @param {number} accountId - ID аккаунта
 * @param {boolean} enabled - Включить (true) или выключить (false)
 */
export const setAutoAcceptTrades = (accountId, enabled) => {
  db.prepare('UPDATE steam_accounts SET auto_accept_trades = ? WHERE id = ?')
    .run(enabled ? 1 : 0, accountId);
};

/**
 * Получить статус автопринятия трейдов для аккаунта
 * @param {number} accountId - ID аккаунта
 * @returns {boolean}
 */
export const getAutoAcceptTrades = (accountId) => {
  const result = db.prepare('SELECT auto_accept_trades FROM steam_accounts WHERE id = ?')
    .get(accountId);
  return result ? result.auto_accept_trades === 1 : false;
};


export default db;
