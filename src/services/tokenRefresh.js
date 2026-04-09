import * as db from '../database.js';
import * as farmManager from './farmManager.js';

/**
 * Проверяет и обновляет токены для всех аккаунтов
 */
export async function checkAndRefreshTokens() {
  console.log('🔄 Проверка токенов аккаунтов...');
  
  const allAccounts = db.getAllSteamAccounts();
  let refreshedCount = 0;
  let errorCount = 0;
  
  for (const account of allAccounts) {
    try {
      // Проверяем, нужно ли обновить токен
      // Steam refresh tokens действительны ~200 дней
      // Обновляем за 30 дней до истечения
      
      const isFarming = farmManager.isFarming(account.id);
      
      if (isFarming) {
        // Если фарм активен, токен валиден
        console.log(`✅ Аккаунт ${account.account_name}: токен валиден (фарм активен)`);
        continue;
      }
      
      // Пытаемся запустить фарм для проверки токена
      const games = db.getGames(account.id);
      if (games.length === 0) {
        console.log(`⏭ Аккаунт ${account.account_name}: нет игр для проверки`);
        continue;
      }
      
      try {
        await farmManager.startFarming(account.id);
        console.log(`✅ Аккаунт ${account.account_name}: токен валиден`);
        
        // Останавливаем фарм, если он не был запущен пользователем
        if (!account.is_farming) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          await farmManager.stopFarming(account.id);
        }
        
        refreshedCount++;
      } catch (error) {
        if (error.message.includes('токен устарел') || error.message.includes('авторизоваться')) {
          console.error(`❌ Аккаунт ${account.account_name}: токен истек`);
          
          // Уведомляем пользователя
          try {
            const bot = (await import('../bot.js')).default;
            await bot.telegram.sendMessage(
              account.user_id,
              `⚠️ Токен для аккаунта ${account.account_name} истек!\n\n` +
              `Пожалуйста, переавторизуйте аккаунт через бота.`
            );
          } catch (notifError) {
            console.error(`❌ Ошибка отправки уведомления:`, notifError.message);
          }
          
          errorCount++;
        } else {
          console.error(`❌ Аккаунт ${account.account_name}: ошибка проверки токена:`, error.message);
          errorCount++;
        }
      }
    } catch (error) {
      console.error(`❌ Ошибка обработки аккаунта ${account.id}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`✅ Проверка токенов завершена: ${refreshedCount} валидных, ${errorCount} ошибок`);
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
