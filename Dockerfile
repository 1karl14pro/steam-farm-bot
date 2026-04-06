FROM node:20-alpine

# Установка зависимостей для сборки native модулей
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копируем package файлы
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Создаем директорию для логов
RUN mkdir -p logs

# Переменные окружения по умолчанию
ENV NODE_ENV=production

# Запуск бота
CMD ["npm", "start"]
