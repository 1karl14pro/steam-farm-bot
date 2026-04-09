# 🚀 Быстрый старт - Деплой на VDS

## Вариант 1: Автоматический деплой (Windows)

1. Откройте `deploy.ps1` и измените:
   ```powershell
   $VDS_IP = "YOUR_VDS_IP"      # IP вашего VDS
   $VDS_USER = "root"            # Пользователь
   ```

2. Запустите:
   ```powershell
   .\deploy.ps1
   ```

Готово! Бот запущен на VDS.

---

## Вариант 2: Ручной деплой (3 команды)

### На локальной машине:
```bash
tar -czf steam-farm-bot.tar.gz --exclude=node_modules --exclude=.git .
scp steam-farm-bot.tar.gz root@YOUR_VDS_IP:/root/
```

### На VDS:
```bash
ssh root@YOUR_VDS_IP
cd /opt/steam-farm-bot
tar -xzf ~/steam-farm-bot.tar.gz
docker-compose up -d --build
```

---

## Управление ботом на VDS

```bash
# Запуск
docker-compose up -d

# Остановка
docker-compose down

# Перезапуск
docker-compose restart

# Логи
docker-compose logs -f

# Статус
docker ps
```

---

## Первая установка на новый VDS

```bash
# 1. Подключитесь к VDS
ssh root@YOUR_VDS_IP

# 2. Установите Docker
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose

# 3. Создайте директорию
mkdir -p /opt/steam-farm-bot
cd /opt/steam-farm-bot

# 4. Загрузите проект (с локальной машины)
# scp steam-farm-bot.tar.gz root@YOUR_VDS_IP:/opt/steam-farm-bot/

# 5. Распакуйте и запустите
tar -xzf steam-farm-bot.tar.gz
docker-compose up -d --build
```

---

## Обновление бота

```bash
# На локальной машине
.\deploy.ps1

# Или вручную на VDS
cd /opt/steam-farm-bot
docker-compose down
# Загрузите новый архив
tar -xzf ~/steam-farm-bot.tar.gz
docker-compose up -d --build
```

---

## Проблемы?

```bash
# Логи в реальном времени
docker-compose logs -f

# Последние 100 строк
docker-compose logs --tail=100

# Перезапуск с пересборкой
docker-compose down
docker-compose up -d --build

# Использование ресурсов
docker stats steam-farm-bot
```
