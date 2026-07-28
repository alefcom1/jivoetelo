# Живое Тело — jivoetelo.ru

Умный навигатор питания: записывайте еду за секунды, получайте честную
оценку, знайте, что съесть дальше.

- Продуктовая спецификация: [docs/product-spec.md](docs/product-spec.md)
- Рабочий план разработки: [docs/implementation-plan.md](docs/implementation-plan.md)
- Деплой на VPS: [docs/deploy-vps.md](docs/deploy-vps.md)

Сейчас в репозитории: публичный лендинг с рабочим листом ожидания и ядро
продукта (майлстоуны M2–M3) — аккаунты, дневник питания с AI-разбором еды
по тексту и фото, редактируемый черновик с уточняющими вопросами, итоги дня,
режим «скрыть калории», стартовый план диапазоном (Миффлин-Сан Жеор с
границами безопасности), вес со сглаженным трендом и рекомендации «что
съесть дальше». Без `ANTHROPIC_API_KEY` AI-функции работают через
mock-провайдер — удобно для локальной разработки.

## Стек

- Next.js (App Router, standalone) + React + TypeScript
- PostgreSQL 17 + Drizzle ORM
- Docker Compose для деплоя на VPS

## Локальная разработка

Требуется Node.js >= 22.13 и Docker (для Postgres).

```bash
cp .env.example .env       # заполнить POSTGRES_PASSWORD и DATABASE_URL
docker compose up -d db    # локальный Postgres
npm install
npm run db:migrate         # применить миграции
npm run dev                # http://localhost:3000
```

Лендинг открывается и без базы; база нужна только для сохранения адресов
из листа ожидания.

## Команды

- `npm run dev` — режим разработки
- `npm run build` — продакшен-сборка
- `npm test` — юнит-тесты
- `npm run lint` — линтер
- `npm run db:generate` — сгенерировать миграцию после правки `db/schema.ts`
- `npm run db:migrate` — применить миграции к базе из `DATABASE_URL`

## Структура

```
app/        страницы и server actions
db/         схема Drizzle и подключение к Postgres
drizzle/    SQL-миграции
lib/        общая логика (валидация и т.п.)
tests/      юнит-тесты (node:test)
docs/       спецификация, план, деплой
```
