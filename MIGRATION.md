# Обновление до микросервисной архитектуры

## Что изменилось

Бот теперь разделен на 3 независимых сервиса:

1. **Database Service** - Контейнер с автоматическими бэкапами БД каждый час
2. **Bot Service** - Telegram бот (обработка команд и сообщений)
3. **Farm Service** - Логика фарма Steam аккаунтов

## Преимущества новой архитектуры

- ✅ **Защита данных**: База данных в отдельном Docker volume с автоматическими бэкапами
- ✅ **Независимое обновление**: Можно обновлять бота без остановки фарма
- ✅ **Масштабируемость**: Легко добавить больше farm-воркеров
- ✅ **Надежность**: Если один сервис упадет, остальные продолжат работать
- ✅ **Бэкапы**: Автоматическое создание бэкапов каждый час, хранение 7 дней

## Миграция

### Сохранение текущей базы данных

```bash
# На VDS
cd /opt/steam-farm-bot
docker-compose down
cp database.db database.db.backup
```

### Запуск новой архитектуры

```bash
# Переименовываем новый docker-compose
mv docker-compose.yml docker-compose.old.yml
mv docker-compose.new.yml docker-compose.yml

# Запускаем новую архитектуру
docker-compose up -d --build

# Проверяем логи
docker-compose logs -f
```

### Восстановление из бэкапа

```bash
# Список бэкапов
docker run --rm -v steam-farm-bot_db-backups:/backups alpine ls -lah /backups

# Восстановление из бэкапа
docker run --rm -v steam-farm-bot_db-backups:/backups -v steam-farm-bot_db-data:/data alpine sh -c "cp /backups/database-YYYYMMDD-HHMMSS.db /data/database.db"
```

## Структура

```
steam-farm-bot/
├── docker-compose.yml          # Новая конфигурация с 3 сервисами
├── Dockerfile.bot              # Dockerfile для Bot Service
├── Dockerfile.farm             # Dockerfile для Farm Service
├── src/
│   ├── bot-service.js          # Точка входа Bot Service
│   ├── farm-service.js         # Точка входа Farm Service
│   └── ...
```

## Мониторинг

```bash
# Статус всех сервисов
docker-compose ps

# Логи конкретного сервиса
docker-compose logs -f bot
docker-compose logs -f farm
docker-compose logs -f database

# Использование ресурсов
docker stats
```
