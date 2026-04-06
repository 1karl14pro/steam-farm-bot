#!/bin/bash

echo "🔄 Обновление Steam Farm Bot..."

# Останавливаем контейнер
echo "⏸ Остановка контейнера..."
docker-compose down

# Скачиваем обновления
echo "📥 Скачивание обновлений с GitHub..."
git pull origin main

# Пересобираем и запускаем
echo "🔨 Пересборка и запуск..."
docker-compose up -d --build

# Ждем 5 секунд
sleep 5

# Показываем статус
echo "✅ Обновление завершено!"
echo ""
echo "📊 Статус контейнера:"
docker-compose ps

echo ""
echo "📋 Последние логи:"
docker-compose logs --tail=20
