import { readFileSync, unlinkSync, existsSync } from 'fs';
import { exec } from 'child_process';

const PID_FILE = './bot.pid';

if (!existsSync(PID_FILE)) {
  console.log('❌ Бот не запущен (PID файл не найден)');
  process.exit(0);
}

try {
  const pid = readFileSync(PID_FILE, 'utf8').trim();
  
  console.log(`🛑 Остановка бота (PID: ${pid})...`);
  
  // Останавливаем только процесс бота по PID
  exec(`taskkill /F /PID ${pid} /T`, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Ошибка остановки:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Бот остановлен');
    
    // Удаляем PID файл
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  });
} catch (err) {
  console.error('❌ Ошибка чтения PID файла:', err.message);
  process.exit(1);
}
