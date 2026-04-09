# 🚀 Быстрый деплой на VDS

## Шаг 1: Подготовка на локальной машине

```bash
# Создаем архив проекта (исключая node_modules)
tar -czf steam-farm-bot.tar.gz --exclude=node_modules --exclude=.git .
```

## Шаг 2: Загрузка на VDS

```bash
# Загружаем архив на VDS
scp steam-farm-bot.tar.gz root@YOUR_VDS_IP:/root/
```

## Шаг 3: Установка на VDS

Подключитесь к VDS:
```bash
ssh root@YOUR_VDS_IP
```

Выполните команды:
```bash
# Устанавливаем Docker и Docker Compose (если еще не установлены)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt-get install -y docker-compose

# Создаем директорию и распаковываем
mkdir -p /opt/steam-farm-bot
cd /opt/steam-farm-bot
tar -xzf ~/steam-farm-bot.tar.gz

# Запускаем бота
docker-compose up -d --build
```

## Управление ботом

```bash
# Запуск
docker-compose up -d

# Остановка
docker-compose down

# Перезапуск
docker-compose restart

# Логи (последние 100 строк)
docker-compose logs --tail=100 -f

# Обновление (после загрузки нового архива)
docker-compose down
tar -xzf ~/steam-farm-bot.tar.gz
docker-compose up -d --build
```

## Автоматический скрипт деплоя

Создайте файл `deploy.sh` на локальной машине:

```bash
#!/bin/bash
VDS_IP="YOUR_VDS_IP"
VDS_USER="root"

echo "📦 Создание архива..."
tar -czf steam-farm-bot.tar.gz --exclude=node_modules --exclude=.git .

echo "📤 Загрузка на VDS..."
scp steam-farm-bot.tar.gz $VDS_USER@$VDS_IP:/root/

echo "🚀 Деплой на VDS..."
ssh $VDS_USER@$VDS_IP << 'EOF'
cd /opt/steam-farm-bot
docker-compose down
tar -xzf ~/steam-farm-bot.tar.gz
docker-compose up -d --build
echo "✅ Деплой завершен!"
docker-compose logs --tail=20
EOF

echo "✅ Готово!"
```

Сделайте скрипт исполняемым и запустите:
```bash
chmod +x deploy.sh
./deploy.sh
```

## Проверка статуса

```bash
# Статус контейнера
docker ps

# Использование ресурсов
docker stats steam-farm-bot

# Логи в реальном времени
docker-compose logs -f
```
