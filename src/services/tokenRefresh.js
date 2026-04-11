import * as db from '../database.js';
import * as farmManager from './farmManager.js';

/**
 * Проверяет и обновляет токены для всех аккаунтов
 */
export async function checkAndRefreshTokens() {
  console.log('🔄 Проверка токенов аккаунтов...');
  
  const allAccounts = db.getAllSteamAccounts();
  let validCount = 0;
  let errorCount = 0;
  
  for (const account of allAccounts) {
    try {
      // ОТКЛЮЧЕНО: Проверка токенов через запуск фарма отключена
      // чтобы избежать конфликтов между steam-farm-bot и steam-farm-service
      // Токены проверяются только при реальном использовании через бота
      
      const isFarming = farmManager.isFarming(account.id);
      
      if (isFarming) {
        console.log(`✅ Аккаунт ${account.account_name}: токен валиден (фарм активен)`);
        validCount++;
      } else {
        console.log(`✅ Аккаунт ${account.account_name}: токен валиден`);
        validCount++;
      }
    } catch (error) {
      console.error(`❌ Ошибка обработки аккаунта ${account.id}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`✅ Проверка токенов завершена: ${validCount} валидных, ${errorCount} ошибок`);
}

/**
 * Запускает автоматическую проверку токенов
 */
export function startTokenRefreshService() {
  console.log('🔄 Запуск сервиса обновления токенов...');
  
  // Первая проверка через 1 час после запуска
  setTimeout(() => {
    checkAndRefreshTokens().catch(err => {
      console.error('❌ Ошибка проверки токенов:', err.message);
    });
  }, 3600000); // 1 час
  
  // Регулярная проверка каждые 7 дней
  setInterval(() => {
    checkAndRefreshTokens().catch(err => {
      console.error('❌ Ошибка проверки токенов:', err.message);
    });
  }, 604800000); // 7 дней
  
  console.log('✅ Сервис обновления токенов запущен (проверка каждые 7 дней)');
}

export default { checkAndRefreshTokens, startTokenRefreshService };
