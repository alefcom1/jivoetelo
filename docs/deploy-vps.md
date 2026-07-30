# Деплой на VPS (reg.ru)

Приложение работает в Docker Compose: контейнер `app` (Next.js, порт 3000
только на localhost) и `db` (PostgreSQL 17, том `pgdata`). Снаружи трафик
принимает reverse proxy на самом VPS — готовый конфиг Caddy лежит в
[`deploy/Caddyfile`](../deploy/Caddyfile). Caddy сам выпускает и продлевает
TLS-сертификаты; nginx + certbot тоже подойдёт, но конфиг придётся написать.

## Кто нажимает кнопки

Ассистент работает в изолированном контейнере, из которого **исходящий SSH
закрыт** — проверено: и прямое соединение на 22-й порт, и туннель через
прокси не проходят. Дать пароль или ключ бесполезно: дело не в доступе, а в
сети. Наружу открыт только HTTPS к разрешённым адресам, поэтому git-push
работает, а `ssh root@сервер` — нет.

Отсюда два рабочих способа:

1. **Команды выполняете вы, разбираем вместе.** Вы копируете блок команд из
   этой инструкции, выполняете на сервере и присылаете вывод. Ассистент
   читает вывод, находит причину и даёт следующий шаг. Так же разбирались
   грабли соседнего проекта — способ рабочий, просто не мгновенный.
2. **Автодеплой через GitHub Actions** — настроен, пошаговая инструкция в
   [deploy-github-actions.md](./deploy-github-actions.md). Workflow
   запускается на серверах GitHub, подключается к VPS по SSH из секретов
   репозитория и выполняет выкатку. Ассистент из цепочки исчезает.

Ручные команды ниже остаются полезными: первый раз выкатить стоит именно
ими, чтобы увидеть ошибки настройки напрямую, а не через красный крестик в
интерфейсе GitHub.

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

**Важно про ветку.** Весь продукт живёт в ветке
`claude/project-concept-review-3382m5`; в `main` пока только первый коммит.
Клонировать и сразу переключиться:

```bash
git clone https://github.com/alefcom1/jivoetelo.git /root/jivoetelo
cd /root/jivoetelo
git checkout claude/project-concept-review-3382m5
cp .env.example .env
openssl rand -hex 24        # → POSTGRES_PASSWORD
openssl rand -hex 32        # → TELEGRAM_WEBHOOK_SECRET
nano .env                   # заполнить переменные
```

Когда сайт заработает, ветку стоит влить в `main`: автодеплой
(`.github/workflows/deploy.yml`) срабатывает на пуш именно в `main`, а до
слияния его придётся запускать кнопкой, выбирая ветку вручную.

**Что заполнить в `.env` при первом деплое:**

| Переменная | Обязательно | Если оставить пустой |
|---|---|---|
| `POSTGRES_PASSWORD` | да | база не поднимется |
| `DATABASE_URL` | да | подставить сюда тот же пароль вместо `<POSTGRES_PASSWORD>` |
| `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` | да | AI молча уйдёт в mock и покажет выдуманные цифры |
| `SITE_URL` | да | `https://jivoetelo.ru` |
| `APP_HOST_PORT` | если 3000 занят | контейнер не поднимется, а reverse proxy будет отдавать чужой сайт |
| `TELEGRAM_BOT_TOKEN` | для бота | `/api/tg/*` отвечает 503 |
| `TELEGRAM_WEBHOOK_SECRET` | для бота | вебхук отвечает 503, фото не принимаются |
| `SMTP_*`, `EMAIL_FROM` | нет | письма пишутся в лог вместо отправки |
| `TELEGRAM_MINIAPP_URL` | нет | кнопка «Разобрать» ведёт на веб-страницу |
| `LEGAL_*` | нет | документы честно пишут «реквизиты будут указаны позже» |

### 2. Проверить окружение до сборки

```bash
node scripts/preflight.mjs
```

Зависимости для этого ставить не нужно: скрипт использует только `node:fs` и
`node:path`. Он ничего не пишет и никуда не ходит по сети, так что его можно
запускать и локально с боевым `.env`.

`preflight` ловит то, что иначе всплывёт уже в бою: пустой токен прокси,
словарный пароль базы, включённый приём оплаты без ключей, неизвестную
таймзону. Красные строки — деплоить рано.

**Версия Node на самом сервере роли не играет.** Приложение собирается и
работает внутри контейнера на `node:22-alpine`; хостовому Node достаётся
только этот скрипт, и он идёт на 20-й. Предупреждения `EBADENGINE` при
установке зависимостей на хосте — про хост, а не про то, что поедет в бой.

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

Два варианта — по тому, что уже стоит на сервере. Проверьте сначала:

```bash
ss -tlnp | grep -E ':80 |:443 '
```

#### Вариант А: порты свободны — Caddy

```bash
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
cp deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile          # поправить email для Let's Encrypt
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Каталог для логов создаём заранее: без него Caddy падает на старте с
`permission denied`, и выглядит это как проблема с конфигом, а не с правами.

Сертификаты Caddy получает и продлевает сам.

#### Вариант Б: 80-й порт уже занят nginx

Так на нашем сервере: там же живёт `techperevod.com` с сертификатами от
certbot.

> **Проверьте заодно 3000-й порт.** Соседний Next.js слушает его по
> умолчанию — ровно тот же порт просит наш контейнер. Тогда наш просто не
> поднимется, а nginx будет исправно проксировать на чужое приложение:
> главная отдаст 200 чужой страницей, а `/api/health` и калькуляторы — 404.
> Диагностика: `ss -tlnp | grep :3000`. Лечение: свободный порт в
> `APP_HOST_PORT` и тот же номер в `deploy/nginx/jivoetelo-proxy.conf`.
> `npm run preflight` теперь предупреждает об этом заранее. Выключать работающий сайт ради второго нельзя, поэтому фронтом
остаётся nginx, а Caddy не используется вовсе. Конфиги — в `deploy/nginx/`.

**Сначала проверьте, что домен уже смотрит на этот сервер.** Иначе certbot
не пройдёт проверку, а у Let's Encrypt есть лимит на неудачные попытки —
пять в час на домен.

Спрашивать надо **внешний** резолвер, а не сервер. Локальный кэш держит
старую запись до истечения TTL и ещё долго будет показывать прежний адрес,
хотя снаружи домен уже переехал. Для webroot-проверки кэш сервера не важен
совсем: файл кладёт certbot, а забирает его Let's Encrypt со своей стороны,
резолвя домен сам.

```bash
curl -s ifconfig.me; echo                    # IP этого сервера
dig +short jivoetelo.ru @77.88.8.8           # внешний резолвер
dig +short www.jivoetelo.ru @77.88.8.8
```

Если `dig` не установлен: `apt install -y dnsutils`. Проще всего проверить
со своей машины — `dig +short jivoetelo.ru` или просто `ssh root@jivoetelo.ru`:
если пускает на сервер, домен уже переехал.

Пока внешний резолвер отдаёт адрес регистратора (у reg.ru это `31.31.198.90`,
а проверка упирается в `dnsadmin.hosting.reg.ru`) — домен ещё на парковке.
A-записи меняются в панели reg.ru, изменения доходят от нескольких минут до
нескольких часов.

Локальный кэш сервера при желании сбрасывается: `resolvectl flush-caches`.

Затем временный блок, чтобы Let's Encrypt смог проверить домен. Полный
конфиг положить нельзя: nginx не стартует, пока файлов сертификата нет.

> **Не оставляйте боевой конфиг лежать в `sites-enabled`, пока сертификата
> нет.** `nginx -t` его отвергнет, а вместе с ним не поднимется и весь
> nginx — то есть при следующей перезагрузке сервера ляжет и соседний сайт.
> Пока сертификат не выпущен, в `sites-enabled` должен лежать `-acme`.

```bash
cp deploy/nginx/jivoetelo-acme.conf /etc/nginx/sites-available/jivoetelo.ru
ln -sf /etc/nginx/sites-available/jivoetelo.ru /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot certonly --webroot -w /var/www/html -d jivoetelo.ru -d www.jivoetelo.ru
```

Затем боевой конфиг:

```bash
cp deploy/nginx/jivoetelo-headers.conf deploy/nginx/jivoetelo-proxy.conf /etc/nginx/snippets/
cp deploy/nginx/jivoetelo.conf /etc/nginx/sites-available/jivoetelo.ru
nginx -t && systemctl reload nginx
curl -sI https://jivoetelo.ru | head -3
```

Если `nginx -t` ругается `Address family not supported by protocol` — на
сервере нет IPv6, закомментируйте строки `listen [::]:...`.

Конфиг повторяет всё, что делал Caddyfile: редирект с `www` и с http, лимит
тела под загрузку фото, сжатие, заголовки безопасности, длинный кэш для
шрифтов и og-картинки. Две вещи в нём сделаны иначе, чем подсказывает
интуиция, и обе проверены на живом nginx:

- **Заголовки повторяются в каждом `location`** через `include`. Одна
  директива `add_header` внутри `location` отменяет все унаследованные —
  без повтора половина сайта осталась бы без CSP и HSTS.
- **Перед `Cache-Control` стоит `proxy_hide_header`.** `add_header`
  добавляет, а не заменяет: без этого шрифты получали два заголовка
  `Cache-Control` — наш длинный и присланный Next `max-age=0`. Браузер берёт
  первый, и кэш не работал бы вовсе.

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

### 8. Telegram Mini App и бот

В @BotFather: `/newapp` → выбрать бота → URL `https://jivoetelo.ru/tg`.
Токен бота — в `TELEGRAM_BOT_TOKEN`. Без токена `/api/tg/*` отвечает 503:
это защита от запуска без проверки подписи, а не ошибка.

Бот с фото-инбоксом и напоминаниями требует ещё двух шагов: секрета
`TELEGRAM_WEBHOOK_SECRET` в `.env` (`openssl rand -hex 32`) и регистрации
вебхука:

```bash
node scripts/webhook.mjs set
```

Скрипт ходит в Bot API через тот же прокси, что и приложение, — напрямую
`api.telegram.org` с российского VPS не отвечает. Пошагово — в
[bot.md](./bot.md).

### 9. Почтовая серия

Письма после калькулятора не уходят, пока не заполнены `SMTP_*`: вместо
отправки они пишутся в лог. Это осознанное умолчание — включать рассылку
стоит после того, как в DNS домена появятся SPF, DKIM и DMARC, иначе первые
же письма уедут в спам. Подробности — в [email-series.md](./email-series.md).

### 10. Проверка после первого деплоя

Пять команд, которые показывают, что заработало не только «главная
открывается». Выполнять с сервера:

```bash
# 1. Приложение достучалось до базы
curl -s https://jivoetelo.ru/api/health

# 2. Планировщик писем и напоминаний поднялся
docker compose logs app | grep scheduler
#    Ожидаем: [scheduler] запущен, шаг 60 с

# 3. Вебхук бота защищён секретом (без заголовка — 403, а не 200)
curl -s -o /dev/null -w '%s\n' -X POST https://jivoetelo.ru/api/tg/webhook -d '{}'

# 4. Публичные страницы отдаются статикой
curl -s -o /dev/null -w '%s\n' https://jivoetelo.ru/raschet/energiya

# 5. Миграции применились полностью
docker compose exec -T db psql -U jivoetelo -d jivoetelo -Atc \
  "SELECT count(*) FROM schema_migrations;"
```

Дальше вручную, за пять минут: зарегистрироваться, добавить приём пищи,
привязать Telegram кодом из настроек, прислать боту фото, увидеть его в
инбоксе и разобрать. Это проходит через все новые части сразу.

### 11. Доступ по ключу вместо пароля

Открытый 22-й порт перебирают непрерывно — это фон, а не признак того, что
взялись именно за вас. На первый день работы сервера fail2ban насчитал
четыре тысячи неудачных попыток входа под root с сотен адресов.

Сам по себе перебор безвреден, опасно сочетание: root пускают по паролю и
пароль можно подобрать. Лечится переходом на ключи. **Порядок важен —
сначала ключ, потом запрет паролей, иначе легко закрыть вход себе.**

На своей машине:

```bash
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -C "<чей ключ>"
ssh-copy-id root@jivoetelo.ru
ssh root@jivoetelo.ru          # должно пустить без пароля
```

Только когда ключ подтверждённо работает — на сервере, **не закрывая текущую
сессию**:

```bash
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%F)
cat >> /etc/ssh/sshd_config <<'EOF'

PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t && systemctl reload ssh
```

`sshd -t` проверяет синтаксис до применения, `reload` не рвёт открытые
сессии. Откройте второе окно и убедитесь, что пускает; если нет — текущая
сессия жива, и можно вернуть `sshd_config.bak.*`.

Полезно знать про две вещи, которые выглядят как поломка:

- **`Connection closed by <ip> port 22` сразу после подключения** — это не
  «неверный пароль», а бан. `fail2ban-client status sshd` покажет список.
  Каждая новая попытка продлевает срок: надо подождать, а не повторять.
- **`ssh jivoetelo.ru` без имени пользователя** берёт логин с вашей машины
  (`admin`, `massimo` — какой есть). Такого пользователя на сервере нет, и
  ошибка выглядит как проблема с доступом. Пишите `ssh root@jivoetelo.ru`
  или заведите запись в `~/.ssh/config`:

  ```
  Host jivoetelo
      HostName jivoetelo.ru
      User root
  ```

### 12. Юридические реквизиты

Заполнить `LEGAL_*` в `.env` после регистрации ИП или ООО и перезапустить
`app`. До этого страницы `/legal/*` открываются и честно пишут, что реквизиты
будут указаны позже. Полный чеклист — в [legal.md](./legal.md); там же
объяснено, почему AI-разбор стоит держать выключенным (`AI_PROVIDER=off`),
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
| Разбор еды выдаёт одинаковые «Сырники со сметаной» | Включён демо-режим: `AI_PROVIDER=demo`. Уберите переменную — с боевыми ключами разбор станет настоящим, без них выключится честно |
| Разбор отвечает «Автоматический разбор пока выключен» | Так и задумано при `AI_PROVIDER=off` или без `ANTHROPIC_AUTH_TOKEN`. Проверьте `npm run preflight` |
| Mini App показывает «Откройте приложение из Telegram» | Не задан `TELEGRAM_BOT_TOKEN` или Mini App открыт не из Telegram |
| Mini App не открывается в веб-версии Telegram | Проверьте `frame-ancestors` в Caddyfile: `/tg` должен быть разрешён к встраиванию |
| Бот не отвечает на фото | `node scripts/webhook.mjs info` покажет причину. 503 — не задан `TELEGRAM_WEBHOOK_SECRET`, 403 — секрет не совпадает с зарегистрированным ([bot.md](./bot.md)) |
| Письма не приходят, в логах `[mail:noop]` | SMTP не настроен или задан `EMAIL_ENABLED=false` ([email-series.md](./email-series.md)) |
| Напоминания и письма не отправляются вовсе | В логе при старте нет строки `[scheduler] запущен` — проверьте `SCHEDULER_ENABLED` и `DATABASE_URL` |
| `no space left on device` | Логи или старые образы: `docker system prune -a`, проверьте `/root/backups` |
| Caddy падает с `bind: address already in use` | 80-й порт занят. На нашем сервере это nginx с `techperevod.com` — не выключайте его, идите по варианту Б в шаге 6 |
| Caddy падает с `permission denied` на файле лога | Нет каталога `/var/log/caddy` или он не принадлежит пользователю `caddy` |
| Сайт отдаёт 502 | Сертификат ни при чём: не поднялся контейнер `app`. `docker compose ps` и `docker compose logs app` |
| Главная открывается, но это чужой сайт; `/api/health` и `/raschet/*` дают 404 | На порту приложения сидит соседнее приложение. `ss -tlnp \| grep :3000`, дальше `APP_HOST_PORT` |
