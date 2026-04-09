# Скрипт для быстрого деплоя на VDS
# Использование: .\deploy.ps1

# НАСТРОЙКИ - ИЗМЕНИТЕ НА СВОИ
$VDS_IP = "81.17.154.12"
$VDS_USER = "root"
$VDS_PATH = "/opt/steam-farm-bot"

Write-Host "[*] Начинаю деплой на VDS..." -ForegroundColor Green

# Получаем версию из package.json
$version = (Get-Content package.json | ConvertFrom-Json).version
Write-Host "[*] Версия: $version" -ForegroundColor Cyan

# Создаем архив
Write-Host "[*] Создание архива..." -ForegroundColor Yellow
tar -czf C:/Users/Matychka/Desktop/steam-farm-bot.tar.gz --exclude=node_modules --exclude=.git --exclude=logs --exclude=*.log .

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Ошибка создания архива" -ForegroundColor Red
    exit 1
}

# Загружаем на VDS
Write-Host "[*] Загрузка на VDS..." -ForegroundColor Yellow
scp C:/Users/Matychka/Desktop/steam-farm-bot.tar.gz "${VDS_USER}@${VDS_IP}:/root/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Ошибка загрузки на VDS" -ForegroundColor Red
    exit 1
}

# Деплой на VDS
Write-Host "[*] Деплой на VDS..." -ForegroundColor Yellow
ssh "${VDS_USER}@${VDS_IP}" @"
cd $VDS_PATH

# Создаем резервную копию
echo '[*] Создание резервной копии...'
tar -czf ~/steam-farm-bot-backup-`date +%Y%m%d-%H%M%S`.tar.gz . 2>/dev/null || true

# Останавливаем старую версию
docker-compose down

# Распаковываем новую версию
tar -xzf ~/steam-farm-bot.tar.gz

# Запускаем новую версию
docker-compose up -d --build

echo '[OK] Деплой завершен!'
echo '[*] Версия: $version'
docker-compose logs --tail=20
"@

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Деплой успешно завершен!" -ForegroundColor Green
    Write-Host "[OK] Версия $version развернута на VDS" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Ошибка деплоя" -ForegroundColor Red
    exit 1
}

# Удаляем локальный архив
Remove-Item C:/Users/Matychka/Desktop/steam-farm-bot.tar.gz -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[*] Статус контейнера:" -ForegroundColor Cyan
ssh "${VDS_USER}@${VDS_IP}" "cd $VDS_PATH && docker ps | grep steam-farm-bot"

Write-Host ""
Write-Host "[OK] Готово! Бот версии $version работает на VDS" -ForegroundColor Green


