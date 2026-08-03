import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseQueue, slugify } from "../scripts/content-queue.mjs";

const REAL_QUEUE = readFileSync(new URL("../docs/seo-pipeline.md", import.meta.url), "utf8");

test("берёт невыполненные позиции по порядку и знает их вид", () => {
  const queue = parseQueue(`
### Блюда — вторая волна

- [x] Куриная грудка
- [ ] Рис отварной
- [ ] Творог

### Глоссарий

- [ ] Что такое TDEE
`);

  assert.deepEqual(queue.map((i) => i.title), ["Рис отварной", "Творог", "Что такое TDEE"]);
  assert.equal(queue[0].kind, "dish");
  assert.equal(queue[2].kind, "glossary");
});

test("позиции с пометкой «НЕ брать» не берутся никогда", () => {
  // Такая строка оставлена в очереди как предупреждение будущему себе.
  // Взять её — значит своими руками сделать то, от чего она предостерегает.
  const queue = parseQueue(`
### Блюда — вторая волна

- [ ] Сырники в духовке — НЕ брать: каннибализирует существующие «Сырники»
- [ ] Омлет
`);

  assert.deepEqual(queue.map((i) => i.title), ["Омлет"]);
});

test("строки вне известных разделов игнорируются", () => {
  // В документе есть и другие списки задач — например, чеклист утренней
  // проверки. Конвейер не должен принять пункт чеклиста за тему статьи.
  const queue = parseQueue(`
### Что проверить утром

- [ ] Правдоподобны ли числа

### Глоссарий

- [ ] Что такое дефицит энергии
`);

  assert.deepEqual(queue.map((i) => i.title), ["Что такое дефицит энергии"]);
});

test("slug транслитерируется предсказуемо: из него получается имя ветки", () => {
  assert.equal(slugify("Куриная грудка"), "kurinaya-grudka");
  assert.equal(slugify("Рис отварной"), "ris-otvarnoy");
  assert.equal(slugify("Что такое TDEE и из чего он складывается"), "chto-takoe-tdee-i-iz-chego-on-skladyvaetsya");
});

test("slug не заканчивается дефисом и не длиннее шестидесяти символов", () => {
  const long = slugify("Адаптивная цель: почему план меняется по ходу и что на это влияет вообще");
  assert.ok(long.length <= 60, `длина ${long.length}`);
  assert.ok(!long.endsWith("-"), `хвостовой дефис: ${long}`);
  assert.ok(!long.startsWith("-"), `ведущий дефис: ${long}`);
});

test("slug состоит только из латиницы, цифр и дефисов", () => {
  for (const title of ["Ёлка «в снегу»", "Что такое TDEE?", "Бутерброд с колбасой"]) {
    assert.match(slugify(title), /^[a-z0-9-]+$/, `${title} → ${slugify(title)}`);
  }
});

test("настоящая очередь читается и не пуста", () => {
  // Защита от того, что кто-то поправит разметку документа так, что скрипт
  // перестанет её понимать, — и ночной конвейер молча начнёт видеть пустую
  // очередь вместо двадцати с лишним позиций.
  const queue = parseQueue(REAL_QUEUE);
  assert.ok(queue.length > 10, `в очереди ${queue.length} позиций — похоже, разметка изменилась`);

  const kinds = new Set(queue.map((i) => i.kind));
  assert.ok(kinds.has("dish"), "блюда не распознались");
  assert.ok(kinds.has("glossary"), "глоссарий не распознался");

  for (const item of queue) {
    assert.ok(item.slug.length > 0, `пустой slug у «${item.title}»`);
    assert.doesNotMatch(item.title, /НЕ брать/i, `взята запрещённая позиция: ${item.title}`);
  }
});
