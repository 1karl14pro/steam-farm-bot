import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, '..', 'database.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    is_premium INTEGER DEFAULT 0,
    trial_ends_at INTEGER,
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
    farming_started_at INTEGER DEFAULT 0,
    total_hours_farmed REAL DEFAULT 0,
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
`);

console.log('Database initialized successfully');