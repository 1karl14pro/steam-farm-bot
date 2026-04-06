import { promises as fs } from 'fs';
import path from 'path';
import * as db from '../database.js';
import { getCookies } from './sessionManager.js';
import SteamUser from 'steam-user';

/**
 * Получает cookies через временную сессию если их нет
 * @param {number} accountId 
 * @returns {Promise<Array>} массив cookies
 */
async function ensureCookies(accountId) {
  // If farming is active, use existing cookies
  const farmManager = await import('./farmManager.js');
  const activeFarms = farmManager.getActiveFarms ? farmManager.getActiveFarms() : [];
  const hasActiveFarm = activeFarms.includes(accountId);
  
  let cookies = getCookies(accountId);
  
  if (!cookies || cookies.length === 0) {
    if (hasActiveFarm) {
      console.log(`[PARSER] Фарм активен, использую существующие cookies`);
      return null; // Shouldn't happen, but handle gracefully
    }
    
    console.log(`[PARSER] Нет cookies, создаю временную сессию для аккаунта ${accountId}`);
    
    const account = db.getSteamAccount(accountId);
    if (!account || !account.refresh_token) {
      throw new Error('Нет refresh_token для аккаунта');
    }
    
    return new Promise((resolve, reject) => {
      const client = new SteamUser({
        autoRelogin: false,
        promptSteamGuard: false
      });
      
      const timeout = setTimeout(() => {
        client.logOff();
        reject(new Error('Таймаут при получении сессии'));
      }, 30000);
      
      client.on('webSession', async (sessionID, sessionCookies) => {
        clearTimeout(timeout);
        console.log(`[PARSER] Получена временная сессия с ${sessionCookies.length} cookies`);
        
        // Save cookies temporarily for potential reuse
        const farmManager = await import('./farmManager.js');
        if (farmManager.setAccountCookies) {
          farmManager.setAccountCookies(accountId, sessionCookies);
        }
        
        resolve(sessionCookies);
      });
      
      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Ошибка: ${err.message}`));
      });
      
      client.logOn({ refreshToken: account.refresh_token });
    });
  }
  
  return cookies;
}

/**
 * Получает 64-битный Steam ID из refresh токена
 * @param {string} refreshToken
 * @returns {string|null} steam64id или null если не удалось извлечь
 */
export function extractSteam64Id(refreshToken) {
  try {
    // refreshToken иногда содержит steam64id в JWT payload
    const parts = refreshToken.split('.');
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      // Пытаемся получить steam64id из различных полей
      return payload.sub || payload.aud || payload.steamid || null;
    }
  } catch (e) {
    console.error('Ошибка извлечения SteamID из токена:', e.message);
  }
  return null;
}

/**
 * Сохраняет HTML страницу игр пользователя
 * @param {number} accountId - ID аккаунта
 * @returns {Promise<string>} путь к сохраненному файлу
 */
export async function saveGamesPage(accountId) {
  const account = db.getSteamAccount(accountId);
  if (!account) {
    throw new Error('Аккаунт не найден');
  }

  // Пробуем получить steam64id из токена
  let steam64id = extractSteam64Id(account.refresh_token);
  
  if (!steam64id) {
    // Если не получилось из токена, пробуем получить из cookies
    try {
      const { getCookies } = await import('./sessionManager.js');
      const cookies = getCookies(accountId);
      
      if (cookies && cookies.length > 0) {
        const steamLoginCookie = cookies.find(c => c.includes('steamLoginSecure'));
        if (steamLoginCookie) {
          const cookieValue = steamLoginCookie.split('=')[1]?.split(';')[0];
          steam64id = cookieValue?.split('||')[0];
        }
      }
    } catch (e) {
      console.error('Ошибка получения SteamID из cookies:', e.message);
    }
  }

  if (!steam64id) {
    throw new Error('Не удалось получить SteamID для аккаунта');
  }

  const htmlDir = path.join('html_test');
  const filePath = path.join(htmlDir, `${steam64id}_games.html`);

  try {
    await fs.mkdir(htmlDir, { recursive: true });
    const cookies = await ensureCookies(accountId);
    console.log(`[PARSER] Using ${cookies.length} cookies for request`);
    
    const response = await fetch(`https://steamcommunity.com/profiles/${steam64id}/games/?tab=all`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://steamcommunity.com/',
        ...(cookies.length > 0 ? { 'Cookie': cookies.join('; ') } : {})
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ HTTP ${response.status} при получении страницы игр для ${steam64id}`);
      // В случае ошибки создадим пустой файл
      await fs.writeFile(filePath, `<!-- Ошибка получения данных для ${steam64id}: HTTP ${response.status} -->\n`, 'utf8');
      return filePath;
    }

    const html = await response.text();
    console.log(`[PARSER] Получен HTML длиной ${html.length} символов для ${steam64id}`);
    
    // Проверяем, требуется ли авторизация - ищем явные признаки страницы входа
    const isLoginPage = html.includes('Sign In') && html.includes('password') || html.includes('Вход в Steam');
    if (isLoginPage) {
      console.warn(`[PARSER] Требуется авторизация для ${steam64id}`);
      await fs.writeFile(filePath, `<!-- Требуется авторизация -->\n${html}`, 'utf8');
      return filePath;
    }
    
    await fs.writeFile(filePath, html, 'utf8');
  } catch (error) {
    console.error(`❌ Ошибка получения HTML страницы игр для ${steam64id}:`, error.message);
    // В случае ошибки создадим пустой файл
    await fs.writeFile(filePath, `<!-- Ошибка получения данных для ${steam64id}: ${error.message} -->\n`, 'utf8');
  }
  
  return filePath;
}

/**
 * Парсит HTML файл и извлекает игры с часами
 * @param {string} filePath - путь к HTML файлу
 * @returns {Promise<Array>} массив игр с информацией о часами
 */
export async function parseGamesFromHtml(filePath) {
  try {
    const html = await fs.readFile(filePath, 'utf8');
    const games = [];
    const seen = new Set();
    
    // Ищем все блоки с играми через более широкий поиск
    // Паттерн: ищем /app/APPID и ближайший TOTAL PLAYED
    const appIdMatches = [...html.matchAll(/\/app\/(\d+)/g)];
    
    for (const match of appIdMatches) {
      const appId = parseInt(match[1]);
      if (seen.has(appId)) continue;
      
      const startPos = match.index;
      // Ищем в окне 1000 символов после app ID
      const context = html.substring(startPos, startPos + 1000);
      
      // Ищем название игры (в alt или title)
      const nameMatch = context.match(/(?:alt|title)="([^"]+)"/);
      
      // Ищем часы в разных форматах
      const hoursMatch = context.match(/TOTAL PLAYED[\s\S]*?([\d,]+(?:\.\d+)?)\s*(?:hours?|hrs?)/i) ||
                        context.match(/([\d,]+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:on record|played)/i);
      
      if (nameMatch && hoursMatch) {
        const name = nameMatch[1];
        const hours = parseFloat(hoursMatch[1].replace(/,/g, ''));
        const playtimeMinutes = Math.round(hours * 60);
        
        // Фильтруем системные названия и игры без часов
        if (name && 
            name.length > 1 && 
            !name.includes('http') && 
            !name.includes('steam') &&
            playtimeMinutes > 0) {
          seen.add(appId);
          games.push({ 
            name, 
            playtime_forever: playtimeMinutes,
            appId 
          });
        }
      }
    }
    
    console.log(`[PARSER] Найдено ${games.length} игр с часами из HTML`);
    
    // Сортируем по времени игры
    games.sort((a, b) => b.playtime_forever - a.playtime_forever);
    return games;
  } catch (error) {
    console.error('[PARSER] Ошибка парсинга HTML файла:', error.message);
    return [];
  }
}
