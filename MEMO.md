# 📝 Памятка по обновлениям

## Текущая версия: 1.8.1

## Когда будем делать обновление:

### Я делаю:
1. ✅ Пишу/исправляю код
2. ✅ Меняю версию в package.json (например, 1.8.1 → 1.8.2)
3. ✅ Добавляю запись в CHANGELOG.md
4. ✅ Говорю: "Готово к деплою!"

### Вы делаете:
```powershell
cd C:\Users\Matychka\Desktop\steam-farm-bot
.\deploy.ps1
```

**Всё!** Одна команда - и новая версия на VDS.

## Что делает deploy.ps1:
- Показывает версию
- Создает архив
- Загружает на VDS
- Создает резервную копию на VDS (автоматически!)
- Останавливает старую версию
- Запускает новую версию
- Показывает логи

## Проверка версии:

**На VDS:**
```bash
ssh root@81.17.154.12 "cd /opt/steam-farm-bot && cat package.json | grep version"
```

## Резервные копии:

Автоматически создаются на VDS в `/root/steam-farm-bot-backup-YYYYMMDD-HHMMSS.tar.gz`

## Откат (если нужно):

```bash
ssh root@81.17.154.12
cd /opt/steam-farm-bot
docker-compose down
tar -xzf ~/steam-farm-bot-backup-YYYYMMDD-HHMMSS.tar.gz
docker-compose up -d --build
```

## История изменений:

Смотрите `CHANGELOG.md`

---

**Важно:** Всегда обновляемся вместе! Я готовлю код, вы запускаете деплой.
