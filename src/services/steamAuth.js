import { LoginSession, EAuthTokenPlatformType } from 'steam-session';
import QRCode from 'qrcode';
import * as db from '../database.js';

// Хранилище активных сессий авторизации (глобальное для всех импортов)
if (!global.activeSessions) {
  global.activeSessions = new Map();
}
const activeSessions = global.activeSessions;

/**
 * Создает QR-код для авторизации Steam
 * @param {number} userId - Telegram ID пользователя
 * @returns {Promise<Buffer>} - QR-код в виде PNG буфера
 */
export async function createQRAuth(userId) {
  // Проверяем лимит аккаунтов
  const accounts = db.getSteamAccounts(userId);
  const limit = db.getAccountLimit(userId);
  
  if (accounts.length >= limit) {
    throw new Error(`Достигнут лимит аккаунтов (${limit}). Купите Premium для увеличения лимита.`);
  }

  // Создаем сессию авторизации
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
  
  // Запускаем процесс авторизации через QR
  const startResult = await session.startWithQR();
  
  // Генерируем QR-код из URL
  const qrBuffer = await QRCode.toBuffer(startResult.qrChallengeUrl, {
    width: 400,
    margin: 2
  });

  // Сохраняем сессию для отслеживания
  activeSessions.set(userId, {
    session,
    startedAt: Date.now(),
    type: 'qr'
  });

  return qrBuffer;
}

/**
 * Создает сессию для авторизации через логин/пароль
 * @param {number} userId - Telegram ID пользователя
 * @param {string} accountName - Логин Steam
 * @param {string} password - Пароль Steam
 * @returns {Promise<Object>} - Результат авторизации
 */
export async function createCredentialsAuth(userId, accountName, password) {
  // Проверяем лимит аккаунтов
  const accounts = db.getSteamAccounts(userId);
  const limit = db.getAccountLimit(userId);
  
  if (accounts.length >= limit) {
    throw new Error(`Достигнут лимит аккаунтов (${limit}). Купите Premium для увеличения лимита.`);
  }
  
  // Проверяем, не добавлен ли уже этот аккаунт
  const existingAccount = accounts.find(acc => acc.account_name.toLowerCase() === accountName.toLowerCase());
  if (existingAccount) {
    throw new Error(`Аккаунт ${accountName} уже добавлен`);
  }

  // Создаем сессию авторизации
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
  
  // Создаем объект для отслеживания статуса
  const sessionData = {
    session,
    startedAt: Date.now(),
    type: 'credentials',
    accountName,
    status: 'pending'
  };
  
  // Сохраняем сессию для отслеживания
  activeSessions.set(userId, sessionData);
  
  // Запускаем процесс авторизации через логин/пароль
  try {
    const startResult = await session.startWithCredentials({
      accountName,
      password
    });
    
    // Проверяем, требуется ли Steam Guard
    if (startResult.actionRequired) {
      sessionData.status = 'steamguard';
    }
    
    // Слушаем события сессии
    session.on('authenticated', async () => {
      try {
        const refreshToken = session.refreshToken;
        const finalAccountName = session.accountName || accountName;
        
        // Проверяем, не добавлен ли уже этот аккаунт
        const accounts = db.getSteamAccounts(userId);
        const existingAccount = accounts.find(acc => acc.account_name.toLowerCase() === finalAccountName.toLowerCase());
        
        if (!existingAccount) {
          const accountId = db.addSteamAccount(userId, finalAccountName, null, null, null, refreshToken);
          
          sessionData.status = 'success';
          sessionData.accountName = finalAccountName;
          sessionData.accountId = accountId;
        } else {
          sessionData.status = 'error';
          sessionData.error = `Аккаунт ${finalAccountName} уже добавлен`;
        }
      } catch (err) {
        sessionData.status = 'error';
        sessionData.error = err.message;
      }
    });
    
    session.on('error', (err) => {
      sessionData.status = 'error';
      sessionData.error = err.message;
    });
    
    return startResult;
  } catch (error) {
    sessionData.status = 'error';
    sessionData.error = error.message;
    throw error;
  }
}

/**
 * Отправляет Steam Guard код для завершения авторизации
 * @param {number} userId - Telegram ID пользователя
 * @param {string} code - Steam Guard код (email или mobile)
 * @returns {Promise<Object>} - Данные аккаунта
 */
export async function submitSteamGuardCode(userId, code) {
  const sessionData = activeSessions.get(userId);
  
  if (!sessionData) {
    throw new Error('Сессия авторизации не найдена');
  }

  const { session, accountName } = sessionData;

  try {
    // Отправляем код
    await session.submitSteamGuardCode(code);
    
    // Ждем завершения авторизации
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Таймаут ожидания авторизации'));
      }, 30000);

      session.once('authenticated', () => {
        clearTimeout(timeout);
        resolve();
      });

      session.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Ждем пока событие authenticated добавит аккаунт
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Проверяем что аккаунт был добавлен
    if (sessionData.status === 'success' && sessionData.accountId) {
      const result = {
        accountName: sessionData.accountName,
        refreshToken: session.refreshToken,
        accountId: sessionData.accountId
      };
      
      // Удаляем сессию
      activeSessions.delete(userId);
      
      return result;
    } else if (sessionData.status === 'error') {
      throw new Error(sessionData.error);
    } else {
      throw new Error('Не удалось добавить аккаунт');
    }
  } catch (error) {
    // Не удаляем сессию при ошибке - пользователь может попробовать снова
    throw error;
  }
}

/**
 * Ожидает подтверждения авторизации через QR
 * @param {number} userId - Telegram ID пользователя
 * @param {Function} onProgress - Callback для обновления статуса
 * @returns {Promise<Object>} - Данные аккаунта (accountName, refreshToken)
 */
export async function waitForQRConfirmation(userId, onProgress) {
  const sessionData = activeSessions.get(userId);
  
  if (!sessionData) {
    throw new Error('Сессия авторизации не найдена');
  }

  const { session } = sessionData;

  return new Promise((resolve, reject) => {
    // Таймаут 2 минуты
    const timeout = setTimeout(() => {
      activeSessions.delete(userId);
      reject(new Error('Время ожидания истекло'));
    }, 120000);

    // Событие при успешной авторизации
    session.on('authenticated', async () => {
      clearTimeout(timeout);
      
      try {
        // Получаем refresh token
        const refreshToken = session.refreshToken;
        const accountName = session.accountName;

        // Проверяем, не добавлен ли уже этот аккаунт
        const accounts = db.getSteamAccounts(userId);
        const existingAccount = accounts.find(acc => acc.account_name.toLowerCase() === accountName.toLowerCase());
        if (existingAccount) {
          throw new Error(`Аккаунт ${accountName} уже добавлен`);
        }

        // Сохраняем в БД
        const accountId = db.addSteamAccount(userId, accountName, null, null, null, refreshToken);

        // Удаляем сессию
        activeSessions.delete(userId);

        resolve({ accountName, refreshToken, accountId });
      } catch (error) {
        activeSessions.delete(userId);
        reject(error);
      }
    });

    // Событие при ошибке
    session.on('error', (err) => {
      clearTimeout(timeout);
      activeSessions.delete(userId);
      reject(err);
    });

    // Событие polling (опционально)
    session.on('polling', () => {
      onProgress?.('⏳ Ожидание сканирования QR-кода...');
    });
  });
}

/**
 * Отменяет активную сессию авторизации
 * @param {number} userId - Telegram ID пользователя
 */
export function cancelAuth(userId) {
  const sessionData = activeSessions.get(userId);
  if (sessionData) {
    sessionData.session.cancelLoginAttempt();
    activeSessions.delete(userId);
  }
}

/**
 * Получает информацию об активной сессии
 * @param {number} userId - Telegram ID пользователя
 * @returns {Object|null} - Информация о сессии
 */
export function getActiveSession(userId) {
  return activeSessions.get(userId) || null;
}

/**
 * Очистка старых сессий (старше 3 минут)
 */
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of activeSessions.entries()) {
    if (now - data.startedAt > 180000) { // 3 минуты
      data.session.cancelLoginAttempt();
      activeSessions.delete(userId);
    }
  }
}, 60000); // Проверка каждую минуту
