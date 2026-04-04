import { LoginSession, EAuthTokenPlatformType } from 'steam-session';
import QRCode from 'qrcode';
import * as db from '../database.js';

// Хранилище активных сессий авторизации
const activeSessions = new Map();

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
    startedAt: Date.now()
  });

  return qrBuffer;
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

        // Сохраняем в БД
        const result = db.createSteamAccount(userId, accountName, refreshToken);
        const accountId = result.lastInsertRowid;

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
export function cancelQRAuth(userId) {
  const sessionData = activeSessions.get(userId);
  if (sessionData) {
    sessionData.session.cancelLoginAttempt();
    activeSessions.delete(userId);
  }
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
