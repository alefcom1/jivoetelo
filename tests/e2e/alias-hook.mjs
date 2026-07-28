/**
 * Разрешение алиаса `@/` для запуска серверных модулей напрямую в Node.
 *
 * Внутри приложения `@/db` и `@/lib/...` разбирает сборщик Next по paths из
 * tsconfig. Тестам, которые дёргают эти модули без сборки, нужен тот же
 * алиас — иначе пришлось бы либо переписывать импорты на относительные, либо
 * тестировать через HTTP то, что удобнее проверить вызовом функции.
 *
 * Подключается так:
 *   node --import ./tests/e2e/alias-hook.mjs tests/e2e/scheduler.mjs
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-resolver.mjs", pathToFileURL(`${import.meta.dirname}/`));
