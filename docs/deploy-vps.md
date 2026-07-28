# Деплой на VPS (reg.ru)

Приложение работает в Docker Compose: контейнер `app` (Next.js, порт 3000
только на localhost) и `db` (PostgreSQL 17, том `pgdata`). Снаружи трафик
принимает reverse proxy на самом VPS — готовый конфиг Caddy лежит в
[`deploy/Caddyfile`](../deploy/Caddyfile). Caddy сам выпускает и продлевает
TLS-сертификаты; nginx + certbot тоже подойдёт, но конфиг придётся написать.

## Что нужно до начала

- VPS с Docker Engine и плагином `docker compose`;
- домен `jivoetelo.ru`, A-запись на IP VPS (и `www` — тоже A или CNAME);
- открытые порты 80 и 443;
- токен прокси к Anthropic (см. [ai-proxy.md](./ai-proxy.md)) — без него
  AI-разбор молча уходит в mock и показывает выдуманные цифры;
- токен бота от @BotFather, если запускаем Mini App.

## Порядок первого деплоя

### 0. Swap — до первой сборки

Пик `next build` съедает больше гигабайта; без swap на небольшом VPS сборка
получит OOM ровно в тот момент, когда всё выглядело хорошо. Один раз:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -m                      # проверить, что swap появился
```

Расклад по памяти и настройки контейнеров — в
[shared-infra.md](./shared-infra.md).

### 1. Код и окружение

```bash
git clone https://github.com/alefcom1/jivoetelo.git /root/jivoetelo
cd /root/jivoetelo
cp .env.example .env
openssl rand -hex 24        # → POSTGRES_PASSWORD
nano .env                   # заполнить переменные
```

### 2. Проверить окружение до сборки

```bash
npm install --omit=dev --ignore-scripts   # только чтобы был node_modules для скрипта
npm run preflight
```

`preflight` ловит то, что иначе всплывёт уже в бою: пустой токен прокси,
словарный пароль базы, включённый приём оплаты без ключей, неизвестную
таймзону. Красные строки — деплоить рано.

Если ставить зависимости на VPS не хочется, тот же скрипт можно запустить
локально с боевым `.env`: он ничего не пишет и никуда не ходит.

### 3. Поднять контейнеры

```bash
docker compose up -d --build
```

Сборка занимает несколько минут. Шрифты вшиты в репозиторий
(`public/fonts`), поэтому сборка не ходит в fonts.googleapis.com и не зависит
от доступности Google с российского VPS.

### 4. Применить миграции

```bash
./deploy/migrate.sh
```

Скрипт ведёт таблицу `schema_migrations` и применяет только новые файлы,
каждый в транзакции. Его можно запускать сколько угодно раз — повторный
запуск ничего не делает и печатает «Новых миграций нет».

### 5. Проверить, что приложение живо

```bash
curl -s http://127.0.0.1:3000/api/health     # {"status":"ok"}
docker compose ps                             # app должен быть healthy
```

`/api/health` отвечает 200 только если приложение достучалось до базы —
на этот же эндпоинт смотрит healthcheck в `docker-compose.yml`.

### 6. Reverse proxy и TLS

```bash
cp deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile          # поправить email для Let's Encrypt
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Конфиг уже включает: сжатие, HSTS и остальные заголовки безопасности, лимит
размера тела запроса под загрузку фото, длинный кэш для шрифтов и og-картинки,
редирект с `www`. Отдельно обратите внимание на `frame-ancestors`: сайт
запрещено встраивать в iframe везде, кроме `/tg` — иначе Mini App не откроется
в веб-версии Telegram.

### 7. Бэкапы

```bash
mkdir -p /root/backups/jivoetelo
./deploy/backup.sh                 # проверить, что отрабатывает руками
crontab -e
```

```
30 3 * * * /root/jivoetelo/deploy/backup.sh >> /var/log/jivoetelo-backup.log 2>&1
```

Бэкап включает и дамп базы, и фотографии еды: без второго восстановленный
дневник будет ссылаться на несуществующие файлы. Копии на том же диске
спасают только от ошибки оператора — отправьте `/root/backups` во внешнее
хранилище.

**Проверьте восстановление до того, как оно понадобится:**

```bash
./deploy/restore.sh /root/backups/jivoetelo/db-*.sql.gz \
                    /root/backups/jivoetelo/uploads-*.tar.gz
```

Скрипт останавливает приложение, переименовывает текущую базу в `*_old`
и разворачивает дамп рядом — откатиться можно, пока `*_old` не удалена.

### 8. Telegram Mini App

В @BotFather: `/newapp` → выбрать бота → URL `https://jivoetelo.ru/tg`.
Токен бота — в `TELEGRAM_BOT_TOKEN`. Без токена `/api/tg/*` отвечает 503:
это защита от запуска без проверки подписи, а не ошибка.

### 9. Юридические реквизиты

Заполнить `LEGAL_*` в `.env` после регистрации ИП или ООО и перезапустить
`app`. До этого страницы `/legal/*` открываются и честно пишут, что реквизиты
будут указаны позже. Полный чеклист — в [legal.md](./legal.md); там же
объяснено, почему AI-разбор стоит держать выключенным (`AI_PROVIDER=mock`),
пока не подано уведомление о трансграничной передаче.

## Обновление

```bash
cd /root/jivoetelo
git pull
docker compose up -d --build
./deploy/migrate.sh
curl -s http://127.0.0.1:3000/api/health
```

## Эксплуатация

Логи ограничены (10 МБ × 5 файлов на контейнер), диск ими не забьётся:

```bash
docker compose logs -f app --tail 100
```

Посмотреть лист ожидания:

```bash
docker compose exec db psql -U jivoetelo -d jivoetelo \
  -c "SELECT email, created_at FROM waitlist_subscribers ORDER BY created_at DESC;"
```

Выгрузка в CSV:

```bash
docker compose exec -T db psql -U jivoetelo -d jivoetelo \
  -c "COPY (SELECT email, created_at FROM waitlist_subscribers ORDER BY created_at) TO STDOUT WITH CSV HEADER" > waitlist.csv
```

Реальный расход на AI за сегодня:

```bash
docker compose exec db psql -U jivoetelo -d jivoetelo -c \
  "SELECT kind, count(*), sum(input_tokens) AS in, sum(output_tokens) AS out
     FROM ai_usage WHERE on_date = CURRENT_DATE GROUP BY kind;"
```

## Если что-то пошло не так

| Симптом | Причина и что делать |
|---|---|
| `app` перезапускается, healthcheck красный | Проверьте `docker compose logs app`. Чаще всего — не применены миграции: `./deploy/migrate.sh` |
| Разбор еды выдаёт одинаковые «Гречка с курицей» | Работает mock-провайдер: нет `ANTHROPIC_AUTH_TOKEN` или задан `AI_PROVIDER=mock`. Проверьте `npm run preflight` |
| Mini App показывает «Откройте приложение из Telegram» | Не задан `TELEGRAM_BOT_TOKEN` или Mini App открыт не из Telegram |
| Mini App не открывается в веб-версии Telegram | Проверьте `frame-ancestors` в Caddyfile: `/tg` должен быть разрешён к встраиванию |
| `no space left on device` | Логи или старые образы: `docker system prune -a`, проверьте `/root/backups` |
