# Доступ к AI API с российского VPS

`api.anthropic.com` может быть недоступен напрямую с сервера в РФ. Это риск №3
из [плана](./implementation-plan.md), и он решается прокси — тем же приёмом,
который уже используется в вашем репозитории `alefcom1/remarka-proxy`.

## Как это работает

Приложение читает переменную `ANTHROPIC_BASE_URL`. Если она задана, SDK
отправляет запросы туда вместо `api.anthropic.com`:

```
ANTHROPIC_BASE_URL=https://your-proxy.vercel.app
ANTHROPIC_API_KEY=sk-ant-...
```

Если переменная пуста — работаем напрямую. Никаких изменений в коде не нужно.

## Вариант 1: серверless-прокси (как в remarka-proxy)

Функция на Vercel в европейском регионе, пересылающая запросы к Anthropic.
Ключ хранится на стороне прокси, а не передаётся из приложения.

Отличия от `remarka-proxy`, которые стоит внести для нашего случая:

- **Проксировать путь целиком**, а не только `/v1/messages` — SDK ходит и в
  другие эндпоинты, а нам ещё понадобится Files API для фото.
- **Пробрасывать заголовки** `anthropic-beta` (мы используем фолбэки при
  отказах и структурированный вывод) и `anthropic-version`.
- **Стримить ответ**, а не буферизовать через `res.json()` — иначе длинные
  ответы упрутся в лимит времени функции.
- **`maxDuration`** поднять до максимума тарифа: разбор фото занимает секунды.

Минимальный вариант:

```js
// api/[...path].js
export const config = { runtime: "edge" };

export default async function handler(request) {
  const url = new URL(request.url);
  if (request.headers.get("x-proxy-secret") !== process.env.PROXY_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  const upstream = new URL(url.pathname + url.search, "https://api.anthropic.com");
  return fetch(upstream, {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": request.headers.get("anthropic-version") ?? "2023-06-01",
      ...(request.headers.get("anthropic-beta")
        ? { "anthropic-beta": request.headers.get("anthropic-beta") }
        : {}),
    },
    body: request.method === "POST" ? request.body : undefined,
    duplex: "half",
  });
}
```

> Прокси видит содержимое запросов — то есть описания и фото еды. Это данные
> о здоровье пользователей: разворачивайте прокси на своём аккаунте, включите
> HTTPS-only и не логируйте тела запросов. С точки зрения 152-ФЗ это
> трансграничная передача — обсудите с юристом до публичного запуска.

## Вариант 2: выделенный сервер вне РФ

Тот же приём, но на своём VPS (nginx + `proxy_pass`). Дороже, зато данные не
проходят через сторонний хостинг и проще контролировать логи.

## Проверка

```bash
# С сервера: доступен ли Anthropic напрямую
curl -s -o /dev/null -w "%{http_code}\n" https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"
```

`200` — прокси не нужен. Таймаут или `403` — задайте `ANTHROPIC_BASE_URL`.

До настройки ключа приложение работает на mock-провайдере: интерфейс и все
сценарии проверяются без внешних вызовов.
