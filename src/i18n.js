import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем все локали
const locales = {
  ru: JSON.parse(readFileSync(join(__dirname, 'locales', 'ru.json'), 'utf-8')),
  en: JSON.parse(readFileSync(join(__dirname, 'locales', 'en.json'), 'utf-8')),
  uk: JSON.parse(readFileSync(join(__dirname, 'locales', 'uk.json'), 'utf-8'))
};

const defaultLocale = 'ru';

/**
 * Получить перевод по ключу
 * @param {string} locale - Код языка (ru, en, uk)
 * @param {string} key - Ключ перевода (например: "menu.main")
 * @param {Object} params - Параметры для подстановки
 * @returns {string}
 */
export function t(locale, key, params = {}) {
  // Если локаль не поддерживается, используем дефолтную
  if (!locales[locale]) {
    locale = defaultLocale;
  }

  // Разбиваем ключ на части (например: "menu.main" -> ["menu", "main"])
  const keys = key.split('.');
  let value = locales[locale];

  // Проходим по всем частям ключа
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Если ключ не найден, пробуем дефолтную локаль
      value = locales[defaultLocale];
      for (const k2 of keys) {
        if (value && typeof value === 'object' && k2 in value) {
          value = value[k2];
        } else {
          return key; // Возвращаем сам ключ, если перевод не найден
        }
      }
      break;
    }
  }

  // Если значение не строка, возвращаем ключ
  if (typeof value !== 'string') {
    return key;
  }

  // Подставляем параметры
  let result = value;
  for (const [param, paramValue] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), paramValue);
  }

  return result;
}

/**
 * Получить список доступных языков
 * @returns {Array}
 */
export function getAvailableLanguages() {
  return [
    { code: 'ru', name: '🇷🇺 Русский' },
    { code: 'en', name: '🇬🇧 English' },
    { code: 'uk', name: '🇺🇦 Українська' }
  ];
}

/**
 * Проверить, поддерживается ли язык
 * @param {string} locale
 * @returns {boolean}
 */
export function isLocaleSupported(locale) {
  return locale in locales;
}

export default { t, getAvailableLanguages, isLocaleSupported };
