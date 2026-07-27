# Деплой на VPS (reg.ru)

Приложение работает в Docker Compose: контейнер `app` (Next.js, порт 3000
только на localhost) и `db` (PostgreSQL 17, том `pgdata`). Снаружи трафик
принимает reverse proxy на самом VPS (ниже пример для Caddy — он сам
выпускает и продлевает TLS-сертификаты; nginx + certbot тоже подойдёт).

## Требования

- Docker Engine + плагин `docker compose`;
- домен `jivoetelo.ru`, A-запись на IP VPS;
- открытые порты 80/443.

## Первый запуск

```bash
git clone https://github.com/alefcom1/jivoetelo.git
cd jivoetelo
cp .env.example .env
# заполнить POSTGRES_PASSWORD (openssl rand -hex 24)

docker compose up -d --build

# применить миграции (пока вручную, по одному файлу в порядке номеров):
docker compose exec -T db psql -U jivoetelo -d jivoetelo < drizzle/0000_init-waitlist.sql
```

Проверка: `curl -I http://127.0.0.1:3000` должен вернуть `200`.

> **Если сборка падает на шрифтах.** `next/font/google` скачивает шрифты в
> момент сборки с fonts.googleapis.com. Если с VPS этот домен недоступен,
> соберите образ там, где доступ есть (локально / CI), либо переведите
> шрифты на локальные файлы (`next/font/local`) — это же уберёт зависимость
> от Google при каждой сборке.

## Reverse proxy (Caddy)

`/etc/caddy/Caddyfile`:

```
jivoetelo.ru {
    reverse_proxy 127.0.0.1:3000
}

www.jivoetelo.ru {
    redir https://jivoetelo.ru{uri} permanent
}
```

После правки: `systemctl reload caddy`. Сертификаты Caddy получает и
продлевает автоматически.

## Обновление

```bash
cd jivoetelo
git pull
docker compose up -d --build
# затем новые миграции из drizzle/, если появились
```

## Бэкапы

Ежедневный дамп БД (crontab root, 03:30):

```
30 3 * * * cd /root/jivoetelo && docker compose exec -T db pg_dump -U jivoetelo jivoetelo | gzip > /root/backups/jivoetelo-$(date +\%F).sql.gz
```

Храните копии и вне VPS (любое внешнее хранилище). Восстановление:

```bash
gunzip -c backup.sql.gz | docker compose exec -T db psql -U jivoetelo -d jivoetelo
```

## Лист ожидания

Посмотреть собранные адреса:

```bash
docker compose exec db psql -U jivoetelo -d jivoetelo \
  -c "SELECT email, created_at FROM waitlist_subscribers ORDER BY created_at DESC;"
```

Выгрузка в CSV:

```bash
docker compose exec -T db psql -U jivoetelo -d jivoetelo \
  -c "COPY (SELECT email, created_at FROM waitlist_subscribers ORDER BY created_at) TO STDOUT WITH CSV HEADER" > waitlist.csv
```
