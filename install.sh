#!/bin/bash
# Скрипт автоматической установки Steam Farm Bot на VDS
# Запустите на VDS: curl -sSL https://raw.githubusercontent.com/YOUR_REPO/install.sh | bash
# Или: wget -qO- https://raw.githubusercontent.com/YOUR_REPO/install.sh | bash

set -e

echo "🚀 Установка Steam Farm Bot..."

# Проверка root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Запустите скрипт от root: sudo bash install.sh"
    exit 1
fi

# Установка Docker
if ! command -v docker &> /dev/null; then
    echo "📦 Установка Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    echo "✅ Docker уже установлен"
fi

# Установка Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Установка Docker Compose..."
    apt-get update
    apt-get install -y docker-compose
else
    echo "✅ Docker Compose уже установлен"
fi

# Создание директории
INSTALL_DIR="/opt/steam-farm-bot"
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

echo ""
echo "✅ Установка завершена!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Загрузите архив проекта: scp steam-farm-bot.tar.gz root@YOUR_VDS_IP:/opt/steam-farm-bot/"
echo "2. Распакуйте: cd /opt/steam-farm-bot && tar -xzf steam-farm-bot.tar.gz"
echo "3. Настройте .env файл с вашими данными"
echo "4. Запустите: docker-compose up -d --build"
echo ""
echo "🔧 Полезные команды:"
echo "  docker-compose logs -f          # Просмотр логов"
echo "  docker-compose restart          # Перезапуск"
echo "  docker-compose down             # Остановка"
echo "  docker-compose up -d --build    # Запуск с пересборкой"
