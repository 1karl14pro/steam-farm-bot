import { existsSync, statSync, renameSync, readdirSync, unlinkSync, createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

const LOG_FILE = './bot.log';
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 МБ
const MAX_LOG_AGE_DAYS = 30; // Хранить логи 30 дней
const ARCHIVE_AFTER_DAYS = 7; // Архивировать логи старше 7 дней

/**
 * Сжимает лог-файл в gzip
 * @param {string} inputFile - Путь к исходному файлу
 * @param {string} outputFile - Путь к сжатому файлу
 */
async function compressLog(inputFile, outputFile) {
  const gzip = createGzip();
  const source = createReadStream(inputFile);
  const destination = createWriteStream(outputFile);
  
  await pipeline(source, gzip, destination);
}

/**
 * Ротирует лог-файл если он превышает максимальный размер
 */
export async function rotateLogIfNeeded() {
  try {
    if (!existsSync(LOG_FILE)) {
      return;
    }
    
    const stats = statSync(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      const timestamp = Date.now();
      const rotatedFile = `./bot.${timestamp}.log`;
      
      renameSync(LOG_FILE, rotatedFile);
      console.log(`📋 Лог ротирован: bot.${timestamp}.log`);
      
      // Сжимаем ротированный лог
      try {
        const compressedFile = `${rotatedFile}.gz`;
        await compressLog(rotatedFile, compressedFile);
        unlinkSync(rotatedFile); // Удаляем несжатый файл
        console.log(`📦 Лог сжат: bot.${timestamp}.log.gz`);
      } catch (compressError) {
        console.error('❌ Ошибка сжатия лога:', compressError.message);
      }
    }
  } catch (err) {
    console.error('❌ Ошибка ротации логов:', err.message);
  }
}

/**
 * Архивирует старые логи (сжимает несжатые логи старше 7 дней)
 */
export async function archiveOldLogs() {
  try {
    const files = readdirSync('.');
    const archiveDate = Date.now() - (ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    let archivedCount = 0;
    
    for (const file of files) {
      // Ищем несжатые старые логи
      if (file.startsWith('bot.') && file.endsWith('.log') && file !== 'bot.log') {
        try {
          const fileStats = statSync(file);
          
          if (fileStats.mtimeMs < archiveDate) {
            const compressedFile = `${file}.gz`;
            
            // Проверяем, не существует ли уже сжатая версия
            if (!existsSync(compressedFile)) {
              await compressLog(file, compressedFile);
              unlinkSync(file);
              archivedCount++;
              console.log(`📦 Архивирован старый лог: ${file}`);
            }
          }
        } catch (err) {
          console.error(`❌ Ошибка архивации ${file}:`, err.message);
        }
      }
    }
    
    if (archivedCount > 0) {
      console.log(`✅ Архивировано ${archivedCount} старых логов`);
    }
  } catch (err) {
    console.error('❌ Ошибка архивации логов:', err.message);
  }
}

/**
 * Удаляет очень старые логи (старше 30 дней)
 */
export function cleanupOldLogs() {
  try {
    const files = readdirSync('.');
    const maxAge = Date.now() - (MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    
    for (const file of files) {
      // Ищем все логи (сжатые и несжатые)
      if (file.startsWith('bot.') && (file.endsWith('.log') || file.endsWith('.log.gz')) && file !== 'bot.log') {
        try {
          const fileStats = statSync(file);
          
          if (fileStats.mtimeMs < maxAge) {
            unlinkSync(file);
            deletedCount++;
            console.log(`🗑 Удален старый лог: ${file}`);
          }
        } catch (err) {
          // Игнорируем ошибки удаления
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`✅ Удалено ${deletedCount} старых логов`);
    }
  } catch (err) {
    console.error('❌ Ошибка очистки логов:', err.message);
  }
}

/**
 * Получает статистику по логам
 */
export function getLogStats() {
  try {
    const files = readdirSync('.');
    let totalSize = 0;
    let logCount = 0;
    let compressedCount = 0;
    
    for (const file of files) {
      if (file.startsWith('bot.') && (file.endsWith('.log') || file.endsWith('.log.gz'))) {
        try {
          const stats = statSync(file);
          totalSize += stats.size;
          logCount++;
          
          if (file.endsWith('.gz')) {
            compressedCount++;
          }
        } catch (err) {
          // Игнорируем ошибки
        }
      }
    }
    
    return {
      totalSize,
      logCount,
      compressedCount,
      uncompressedCount: logCount - compressedCount
    };
  } catch (err) {
    console.error('❌ Ошибка получения статистики логов:', err.message);
    return { totalSize: 0, logCount: 0, compressedCount: 0, uncompressedCount: 0 };
  }
}

/**
 * Запускает автоматическое управление логами
 */
export function startLogManagement() {
  console.log('📋 Запуск системы управления логами...');
  
  // Проверяем размер лога каждый час
  setInterval(() => {
    rotateLogIfNeeded().catch(err => {
      console.error('❌ Ошибка ротации логов:', err.message);
    });
  }, 3600000); // 1 час
  
  // Архивируем старые логи раз в день
  setInterval(() => {
    archiveOldLogs().catch(err => {
      console.error('❌ Ошибка архивации логов:', err.message);
    });
  }, 86400000); // 24 часа
  
  // Удаляем очень старые логи раз в день
  setInterval(() => {
    cleanupOldLogs();
  }, 86400000); // 24 часа
  
  // Показываем статистику раз в неделю
  setInterval(() => {
    const stats = getLogStats();
    const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
    console.log(`📊 Статистика логов: ${stats.logCount} файлов, ${sizeMB} МБ (${stats.compressedCount} сжатых)`);
  }, 604800000); // 7 дней
  
  console.log('✅ Система управления логами запущена');
}

export default {
  rotateLogIfNeeded,
  archiveOldLogs,
  cleanupOldLogs,
  getLogStats,
  startLogManagement
};
