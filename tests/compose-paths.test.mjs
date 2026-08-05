import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Относительные пути в наложениях compose.
 *
 * Docker Compose разрешает их от каталога **первого** файла (корня проекта),
 * а не от каталога того файла, где они написаны. Это противоречит интуиции и
 * не ловится ничем локально: `docker build deploy/speech` работает, а
 * `docker compose -f docker-compose.yml -f deploy/speech/compose.yml` собирает
 * совсем другое.
 *
 * Так и вышло на первом настоящем подъёме: `context: .` собрал корневой
 * Dockerfile приложения, и в контейнере `speech` поднялся Next.js. Снаружи всё
 * выглядело здоровым — контейнер работает, логи чистые, — а порт 8081 не
 * слушал никто. Диагноз занял бы вечер, если бы в логах случайно не оказалось
 * «▲ Next.js».
 *
 * Поэтому проверяем не текст, а существование: каждый путь из наложения
 * обязан указывать на файл, который в репозитории есть.
 */

const ROOT = new URL("../", import.meta.url);
const OVERLAYS = ["deploy/speech/compose.yml"];

/** Пути сборки и монтирования, как их увидит compose — от корня проекта. */
function relativePaths(yaml) {
  const paths = [];

  for (const [, value] of yaml.matchAll(/^\s*context:\s*(\S+)\s*$/gm)) {
    // Контекст сборки — каталог; Dockerfile внутри него ищется по имени.
    paths.push({ kind: "контекст сборки", path: value, expectFile: "Dockerfile" });
  }

  // Монтирование хоста: строки вида `- ./путь:/куда`. Тома по имени
  // (`speech-models:/models`) пропускаем — они не пути.
  for (const [, value] of yaml.matchAll(/^\s*-\s+(\.\/[^:]+):[^:]+/gm)) {
    paths.push({ kind: "монтирование", path: value, expectFile: null });
  }

  return paths;
}

for (const overlay of OVERLAYS) {
  test(`${overlay}: пути разрешаются от корня проекта`, () => {
    const yaml = readFileSync(new URL(overlay, ROOT), "utf8");
    const paths = relativePaths(yaml);
    assert.ok(paths.length > 0, "в наложении не нашлось ни одного относительного пути — проверять нечего");

    for (const { kind, path, expectFile } of paths) {
      const target = new URL(path.replace(/^\.\//, ""), ROOT);
      assert.ok(
        existsSync(target),
        `${kind} «${path}» из ${overlay} указывает в пустоту. ` +
          "Compose считает такие пути от корня проекта, а не от каталога наложения.",
      );

      if (expectFile) {
        assert.ok(
          existsSync(new URL(`${path.replace(/\/$/, "")}/${expectFile}`, ROOT)),
          `в контексте «${path}» нет ${expectFile} — соберётся не тот образ`,
        );
      }
    }
  });

  test(`${overlay}: контекст сборки — не корень проекта`, () => {
    // Отдельной проверкой, потому что корень существует, и предыдущий тест
    // такую ошибку пропустит: `context: .` укажет на живой каталог с живым
    // Dockerfile — просто чужим.
    const yaml = readFileSync(new URL(overlay, ROOT), "utf8");
    for (const [, value] of yaml.matchAll(/^\s*context:\s*(\S+)\s*$/gm)) {
      assert.notEqual(
        value.replace(/^\.\//, "").replace(/\/$/, ""),
        ".",
        `context: ${value} в ${overlay} соберёт корневой Dockerfile приложения, а не свой`,
      );
    }
  });
}
