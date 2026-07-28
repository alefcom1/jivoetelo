import { statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Превращает `@/lib/x` в путь от корня проекта, дописывая расширение, если
 * его не указали. Порядок проб тот же, что у сборщика: сначала файл, потом
 * index в папке.
 */
export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

  const base = path.join(ROOT, specifier.slice(2));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
  // Именно файл: `@/db` — это каталог, и без проверки Node попытался бы
  // прочитать его как модуль.
  const found = candidates.find(isFile);
  if (!found) throw new Error(`Не удалось разрешить ${specifier}`);

  return { url: pathToFileURL(found).href, shortCircuit: true };
}
