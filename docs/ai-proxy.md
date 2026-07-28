# Доступ к Anthropic API

`api.anthropic.com` недоступен напрямую с российского VPS, где будет жить
`jivoetelo.ru`. Изобретать решение не нужно — у вас уже работает прокси-воркер
`proxy.techperevod.com` (репозиторий `alefcom1/techperevod`, каталог
`deploy/techperevod-worker`), развёрнутый на VPS в Hetzner. Оттуда Anthropic
доступен напрямую.

## Как приложение подключается

Anthropic SDK умеет ходить через прокси штатно — двумя переменными:

```
ANTHROPIC_BASE_URL=https://proxy.techperevod.com/api
ANTHROPIC_AUTH_TOKEN=<PROXY_SECRET воркера>
```

`ANTHROPIC_API_KEY` при этом **не нужен**: настоящий ключ живёт только на
воркере, приложение знает лишь общий секрет. SDK отправляет токен в заголовке
`Authorization: Bearer`, воркер подменяет его реальным ключом.

Маршрут `/api/v1/*` воркера уже ведёт на `api.anthropic.com`, а SDK дописывает
к базовому URL `/v1/messages` — то есть путь совпадает без правок воркера.

Если переменные не заданы, приложение работает на mock-провайдере: интерфейс и
все сценарии проверяются без внешних вызовов и без расхода токенов.

## Важная деталь: ECONNRESET на keep-alive

Эту проблему вы уже ловили и чинили в `techperevod`, поэтому она учтена
в `lib/ai/client.ts` с самого начала:

```ts
const upstreamAgent = new UndiciAgent({ pipelining: 0, keepAliveTimeout: 1 });
new Anthropic({ fetchOptions: { dispatcher: upstreamAgent } });
```

Долгоживущий пул соединений может держать сокет, который удалённая сторона уже
закрыла, — следующий запрос падает с `ECONNRESET`. `pipelining: 0` отключает
переиспользование соединений. `fetchOptions.dispatcher` — единственный
официально поддерживаемый SDK способ подменить transport для Node.js fetch.

## Почему не Vercel

В `techperevod` это уже проверено на практике: VPS в России не мог достучаться
до `*.vercel.app` на уровне TCP, хотя сам воркер до Anthropic доходил
нормально. Поэтому воркер и переехал на собственный VPS. Для «Живого Тела»
верно то же самое — используем `proxy.techperevod.com`.

## Что нужно сделать при деплое

1. Взять `PROXY_SECRET` из `.env.local` воркера на Hetzner.
2. Прописать в `.env` «Живого Тела»:
   ```
   ANTHROPIC_BASE_URL=https://proxy.techperevod.com/api
   ANTHROPIC_AUTH_TOKEN=<тот же PROXY_SECRET>
   ```
3. Проверить с VPS сайта:
   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" \
     -X POST https://proxy.techperevod.com/api/v1/messages \
     -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
     -H "anthropic-version: 2023-06-01" \
     -H "content-type: application/json" \
     -d '{"model":"claude-opus-5","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}'
   ```
   `200` — всё готово. `403` — не сходится секрет. Таймаут — воркер недоступен
   с этого сервера.
4. Перезапустить приложение: `docker compose up -d --build`.

### Если решите поднять отдельный воркер под «Живое Тело»

Разумно, когда не хочется делить лимиты и секрет между проектами. Инструкция —
в `deploy/techperevod-worker/README.md` репозитория `techperevod`
(раздел «Деплой на свой VPS»): Node 20+, `npm install`, секреты только в
`.env.local`, запуск через pm2 за nginx с TLS. Отличий для нас нет: тот же
маршрут `/api/v1/*` и тот же `PROXY_SECRET`.

## Приватность

Через прокси проходят описания и фото еды — это данные о здоровье
пользователей. Воркер на вашем VPS, ключи и логи под вашим контролем, это
лучше стороннего хостинга. Два практических требования: не логировать тела
запросов и обсудить с юристом статус передачи данных за пределы РФ (Hetzner —
Германия) до публичного запуска. Это тот же вопрос 152-ФЗ, что и в
[плане](./implementation-plan.md).

## Расход токенов

Дневные лимиты и учёт расхода описаны в [free-tier.md](./free-tier.md).
Пока приложение работает на mock-провайдере, расход нулевой.
