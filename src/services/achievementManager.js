import * as db from '../database.js';
import * as farmManager from './farmManager.js';
import * as steamAchievementUnlocker from './steamAchievementUnlocker.js';

/**
 * ⚠️ ПРЕДУПРЕЖДЕНИЕ О БЕЗОПАСНОСТИ ⚠️
 * 
 * Использование этого модуля для разблокировки достижений:
 * - НАРУШАЕТ правила Steam
 * - Может привести к VAC-бану
 * - Может привести к Trade-бану
 * - Может привести к блокировке аккаунта
 * 
 * Используйте на свой страх и риск!
 * Рекомендуется использовать только на тестовых аккаунтах!
 */

/**
 * Получает список достижений для игры
 * @param {number} accountId - ID аккаунта
 * @param {number} appId - App ID игры
 * @returns {Promise<Array>}
 */
export async function getGameAchievements(accountId, appId) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  if (!account.steam_id_64) {
    throw new Error('Steam ID не найден для этого аккаунта');
  }

  try {
    // Получаем cookies для аккаунта из farmManager
    const cookies = farmManager.getAccountCookies(accountId);
    if (!cookies || cookies.length === 0) {
      throw new Error('Нет сохраненных cookies. Запустите фарм для этого аккаунта.');
    }

    // Формируем cookie строку
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Парсим страницу достижений
    const url = `https://steamcommunity.com/profiles/${account.steam_id_64}/stats/${appId}/?tab=achievements`;
    
    const response = await fetch(url, {
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error('Не удалось загрузить страницу достижений');
    }

    const html = await response.text();
    console.log(`[ACHIEVEMENTS] Получен HTML длиной ${html.length} символов`);

    // Проверяем, есть ли достижения
    if (!html.includes('achieveRow') && !html.includes('achievement')) {
      throw new Error('У этой игры нет достижений или они недоступны');
    }

    const achievements = [];
    const seen = new Set();

    // Ищем все блоки achieveRow
    const achieveMatches = [...html.matchAll(/<div[^>]*class="achieveRow"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi)];
    
    console.log(`[ACHIEVEMENTS] Найдено блоков achieveRow: ${achieveMatches.length}`);
    
    for (const match of achieveMatches) {
      const block = match[0];
      const content = match[1];
      
      // Извлекаем название (в <h3>)
      const nameMatch = content.match(/<h3[^>]*>([^<]+)<\/h3>/i);
      if (!nameMatch) continue;
      
      const displayName = nameMatch[1].trim();
      if (seen.has(displayName)) continue;
      seen.add(displayName);
      
      // Извлекаем описание (в <h5>)
      const descMatch = content.match(/<h5[^>]*>([^<]+)<\/h5>/i);
      const description = descMatch ? descMatch[1].trim() : '';
      
      // Извлекаем иконку
      const iconMatch = block.match(/<img[^>]*src="([^"]+)"/i);
      const icon = iconMatch ? iconMatch[1] : '';
      
      // Определяем, получено ли достижение
      // Ищем "Unlocked" или дату в блоке achieveUnlockTime
      const unlockTimeMatch = block.match(/<div[^>]*class="achieveUnlockTime"[^>]*>([\s\S]*?)<\/div>/i);
      const isAchieved = unlockTimeMatch && unlockTimeMatch[1].includes('Unlocked');
      
      // Пробуем извлечь дату
      let unlockTime = 0;
      if (isAchieved && unlockTimeMatch) {
        // Ищем дату в формате "Jan 18, 2021 @ 10:14pm" или подобном
        const dateMatch = unlockTimeMatch[1].match(/(\w{3}\s+\d{1,2},\s+\d{4})/i);
        if (dateMatch) {
          try {
            unlockTime = Math.floor(new Date(dateMatch[1]).getTime() / 1000);
          } catch (e) {
            // Игнорируем ошибки парсинга даты
          }
        }
      }
      
      // Генерируем API name
      const apiName = displayName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      
      achievements.push({
        name: apiName,
        displayName: displayName,
        description: description,
        icon: icon,
        iconGray: icon,
        hidden: false,
        achieved: isAchieved,
        unlockTime: unlockTime
      });
    }

    if (achievements.length === 0) {
      console.log('[ACHIEVEMENTS] HTML preview:', html.substring(0, 1000));
      throw new Error('Не удалось распарсить достижения. Возможно, формат страницы изменился.');
    }

    console.log(`[ACHIEVEMENTS] Найдено достижений: ${achievements.length} (получено: ${achievements.filter(a => a.achieved).length})`);
    return achievements;
  } catch (error) {
    throw new Error(`Ошибка получения достижений: ${error.message}`);
  }
}

/**
 * Разблокирует одно достижение
 * ⚠️ ОПАСНО! Может привести к бану!
 * 
 * @param {number} accountId - ID аккаунта
 * @param {number} appId - App ID игры
 * @param {string} achievementName - Название достижения (API name)
 * @param {boolean} skipFarmCheck - Пропустить проверку и остановку фарма (для массовой разблокировки)
 * @returns {Promise<Object>} - { wasFarming: boolean }
 */
export async function unlockAchievement(accountId, appId, achievementName, skipFarmCheck = false) {
  let wasFarming = false;
  
  // Автоматически останавливаем игры если фарм активен (только если не пропускаем проверку)
  if (!skipFarmCheck) {
    wasFarming = farmManager.isFarming(accountId);
    
    if (wasFarming) {
      console.log(`[ACHIEVEMENTS] Приостанавливаю игры для аккаунта ${accountId}...`);
      farmManager.pauseGames(accountId);
      // Небольшая задержка для применения изменений
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const client = farmManager.getClient(accountId);
  if (!client) {
    throw new Error('Клиент Steam не найден');
  }

  try {
    // Используем новый модуль для разблокировки достижений через Steam Network API
    await steamAchievementUnlocker.unlockAchievement(client, appId, achievementName);
    
    // Возобновляем игры если фарм был активен
    if (!skipFarmCheck && wasFarming) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await farmManager.resumeGames(accountId);
      console.log(`[ACHIEVEMENTS] Игры возобновлены для аккаунта ${accountId}`);
    }
    
    return { wasFarming };
  } catch (error) {
    // Возобновляем игры если фарм был активен
    if (!skipFarmCheck && wasFarming) {
      await farmManager.resumeGames(accountId);
    }
    
    throw error;
  }
}

/**
 * Разблокирует все достижения игры
 * ⚠️ КРАЙНЕ ОПАСНО! Высокий риск бана!
 * 
 * @param {number} accountId - ID аккаунта
 * @param {number} appId - App ID игры
 * @param {boolean} instant - Моментальная разблокировка (опасно!)
 * @returns {Promise<Object>}
 */
export async function unlockAllAchievements(accountId, appId, instant = false) {
  const wasFarming = farmManager.isFarming(accountId);
  
  // Проверяем, что клиент существует
  const client = farmManager.getClient(accountId);
  if (!client) {
    throw new Error('Клиент Steam не найден. Запустите фарм для этого аккаунта.');
  }
  
  // Останавливаем только игры, но оставляем клиент подключенным
  if (wasFarming) {
    console.log(`[ACHIEVEMENTS] Приостанавливаю игры для аккаунта ${accountId}...`);
    farmManager.pauseGames(accountId);
    // Небольшая задержка для применения изменений
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const achievements = await getGameAchievements(accountId, appId);
  const lockedAchievements = achievements.filter(a => !a.achieved);

  if (lockedAchievements.length === 0) {
    throw new Error('Все достижения уже разблокированы');
  }

  let unlocked = 0;
  let failed = 0;

  if (instant) {
    // МОМЕНТАЛЬНАЯ разблокировка - ОПАСНО!
    console.log(`[ACHIEVEMENTS] МОМЕНТАЛЬНАЯ разблокировка ${lockedAchievements.length} достижений`);
    
    for (const achievement of lockedAchievements) {
      try {
        // Пропускаем проверку фарма, т.к. мы уже остановили его выше
        const result = await unlockAchievement(accountId, appId, achievement.name, true);
        unlocked++;
        
        // Минимальная задержка
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Ошибка разблокировки ${achievement.name}:`, error.message);
        failed++;
      }
    }
  } else {
    // БЕЗОПАСНАЯ разблокировка - в фоне с рандомными задержками
    console.log(`[ACHIEVEMENTS] БЕЗОПАСНАЯ разблокировка ${lockedAchievements.length} достижений в течение часа`);
    
    // Перемешиваем достижения для рандомности
    const shuffled = [...lockedAchievements].sort(() => Math.random() - 0.5);
    
    // Разбиваем на группы по 5-12 достижений
    const groups = [];
    let currentGroup = [];
    
    for (const achievement of shuffled) {
      currentGroup.push(achievement);
      
      // Рандомный размер группы от 5 до 12
      const groupSize = Math.floor(Math.random() * 8) + 5; // 5-12
      
      if (currentGroup.length >= groupSize) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
    }
    
    // Добавляем остаток
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    console.log(`[ACHIEVEMENTS] Разбито на ${groups.length} групп`);
    
    // Общее время - 1 час (3600 секунд)
    const totalTime = 3600000; // 1 час в миллисекундах
    const delayBetweenGroups = totalTime / groups.length;
    
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      console.log(`[ACHIEVEMENTS] Обработка группы ${i + 1}/${groups.length} (${group.length} достижений)`);
      
      for (const achievement of group) {
        try {
          // Пропускаем проверку фарма, т.к. мы уже остановили его выше
          const result = await unlockAchievement(accountId, appId, achievement.name, true);
          unlocked++;
          
          // Рандомная задержка между достижениями в группе (2-5 секунд)
          const delay = Math.floor(Math.random() * 3000) + 2000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
          console.error(`Ошибка разблокировки ${achievement.name}:`, error.message);
          failed++;
        }
      }
      
      // Задержка между группами (рандомная часть от общего времени)
      if (i < groups.length - 1) {
        const randomDelay = delayBetweenGroups * (0.8 + Math.random() * 0.4); // ±20%
        console.log(`[ACHIEVEMENTS] Ожидание ${Math.floor(randomDelay / 1000)} секунд до следующей группы...`);
        await new Promise(resolve => setTimeout(resolve, randomDelay));
      }
    }
  }

  // Возобновляем фарм игр, если он был активен
  if (wasFarming) {
    console.log(`[ACHIEVEMENTS] Возобновляю фарм для аккаунта ${accountId}...`);
    await farmManager.resumeGames(accountId);
  }

  return {
    total: lockedAchievements.length,
    unlocked,
    failed,
    wasFarming,
    instant
  };
}

/**
 * Проверяет безопасность операции с достижениями
 * @param {number} accountId - ID аккаунта
 * @returns {Object}
 */
export function checkSafety(accountId) {
  const isFarming = farmManager.isFarming(accountId);
  const client = farmManager.getClient(accountId);
  
  return {
    safe: client !== null, // Теперь безопасно, если клиент подключен (фарм может быть активен)
    isFarming,
    hasClient: client !== null,
    warnings: [
      '⚠️ Разблокировка достижений нарушает правила Steam',
      '⚠️ Риск VAC-бана в играх с античитом',
      '⚠️ Риск Trade-бана',
      '⚠️ Риск блокировки аккаунта',
      '⚠️ Используйте только на тестовых аккаунтах',
      '⚠️ НЕ запускайте игры во время разблокировки'
    ]
  };
}

export default {
  getGameAchievements,
  unlockAchievement,
  unlockAllAchievements,
  checkSafety
};
