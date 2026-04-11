/**
 * Rate Limiter для Steam API
 * Использует алгоритм Token Bucket для ограничения запросов
 */

class RateLimiter {
  constructor(maxTokens = 20, refillRate = 1, refillInterval = 1000) {
    this.maxTokens = maxTokens; // Максимум токенов
    this.tokens = maxTokens; // Текущее количество токенов
    this.refillRate = refillRate; // Сколько токенов добавлять
    this.refillInterval = refillInterval; // Интервал пополнения (мс)
    this.queue = []; // Очередь ожидающих запросов
    
    // Запускаем пополнение токенов
    this.startRefill();
  }
  
  /**
   * Запускает автоматическое пополнение токенов
   */
  startRefill() {
    this.refillTimer = setInterval(() => {
      this.tokens = Math.min(this.maxTokens, this.tokens + this.refillRate);
      this.processQueue();
    }, this.refillInterval);
  }
  
  /**
   * Останавливает пополнение токенов
   */
  stop() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }
  
  /**
   * Обрабатывает очередь ожидающих запросов
   */
  processQueue() {
    while (this.queue.length > 0 && this.tokens > 0) {
      const { resolve, cost } = this.queue.shift();
      this.tokens -= cost;
      resolve();
    }
  }
  
  /**
   * Ожидает доступности токенов
   * @param {number} cost - Стоимость операции в токенах
   * @returns {Promise<void>}
   */
  async acquire(cost = 1) {
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return Promise.resolve();
    }
    
    // Добавляем в очередь
    return new Promise((resolve) => {
      this.queue.push({ resolve, cost });
    });
  }
  
  /**
   * Получает текущее состояние лимитера
   */
  getStatus() {
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      queueLength: this.queue.length
    };
  }
}

// Создаем глобальные лимитеры для разных типов запросов
const steamApiLimiter = new RateLimiter(20, 2, 1000); // 20 запросов, +2 каждую секунду
const steamWebLimiter = new RateLimiter(30, 3, 1000); // 30 запросов, +3 каждую секунду
const steamStoreLimiter = new RateLimiter(10, 1, 1000); // 10 запросов, +1 каждую секунду

/**
 * Выполняет функцию с rate limiting
 * @param {Function} fn - Функция для выполнения
 * @param {string} type - Тип лимитера ('api', 'web', 'store')
 * @param {number} cost - Стоимость операции в токенах
 * @returns {Promise<any>}
 */
export async function withRateLimit(fn, type = 'api', cost = 1) {
  let limiter;
  
  switch (type) {
    case 'api':
      limiter = steamApiLimiter;
      break;
    case 'web':
      limiter = steamWebLimiter;
      break;
    case 'store':
      limiter = steamStoreLimiter;
      break;
    default:
      limiter = steamApiLimiter;
  }
  
  await limiter.acquire(cost);
  
  try {
    return await fn();
  } catch (error) {
    // Если ошибка rate limit от Steam - добавляем задержку
    if (error.message && error.message.includes('429')) {
      console.warn('[RATE_LIMIT] Получен 429 от Steam, задержка 5 сек...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw error;
  }
}

/**
 * Получает статус всех лимитеров
 */
export function getRateLimitStatus() {
  return {
    api: steamApiLimiter.getStatus(),
    web: steamWebLimiter.getStatus(),
    store: steamStoreLimiter.getStatus()
  };
}

/**
 * Останавливает все лимитеры
 */
export function stopAllLimiters() {
  steamApiLimiter.stop();
  steamWebLimiter.stop();
  steamStoreLimiter.stop();
}

// Graceful shutdown
process.on('SIGINT', stopAllLimiters);
process.on('SIGTERM', stopAllLimiters);

export default {
  withRateLimit,
  getRateLimitStatus,
  stopAllLimiters
};
