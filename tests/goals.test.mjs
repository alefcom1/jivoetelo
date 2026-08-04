import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_GOALS,
  GOAL_DAY2_RETURN,
  GOAL_MEAL_SAVED,
  GOAL_PLAN_DONE,
  GOAL_PLAN_SET,
  GOAL_REPORT_OPENED,
  GOAL_SIGNUP,
  GOAL_TELEGRAM_LINKED,
  GOAL_WEEK1_ACTIVE,
} from "../lib/goals.ts";

/**
 * Цели заводятся в панели Метрики руками, со строгим совпадением имени.
 * Опечатка не ломает ни сборку, ни экран — она даёт цель, которая никогда не
 * срабатывает, и заметить это можно только через неделю по пустому отчёту.
 * Отсюда тест на сами имена.
 */
test("воронка покрыта целиком", () => {
  // Набор из исследования (docs/research-2026-08.md, раздел 7.2). Без него
  // на вопрос «где мы теряем людей» ответа не будет, и задним числом воронку
  // уже не восстановить.
  const required = ["signup", "plan_set", "meal_saved", "telegram_linked", "day2_return", "week1_active", "report_opened"];
  for (const goal of required) {
    assert.ok(ALL_GOALS.includes(goal), `цель ${goal} не заведена`);
  }
});

test("имена целей — латиница и подчёркивания", () => {
  // Метрика принимает и кириллицу, но в отчётах и выгрузках она регулярно
  // приезжает поломанной кодировкой, а сверять имена глазами приходится
  // именно там.
  for (const goal of ALL_GOALS) {
    assert.match(goal, /^[a-z][a-z0-9_]*$/, `имя ${goal} не годится`);
  }
});

test("имена не повторяются", () => {
  // Две константы с одним именем дают одну цель в отчёте — и два разных
  // события, слипшиеся в одну цифру.
  assert.equal(new Set(ALL_GOALS).size, ALL_GOALS.length);
});

test("каждая константа попала в общий список", () => {
  // Заведённая, но забытая в ALL_GOALS цель не попадёт ни в один тест выше,
  // и опечатку в ней ловить будет нечем.
  for (const goal of [
    GOAL_PLAN_DONE, GOAL_SIGNUP, GOAL_MEAL_SAVED, GOAL_PLAN_SET,
    GOAL_DAY2_RETURN, GOAL_WEEK1_ACTIVE, GOAL_TELEGRAM_LINKED, GOAL_REPORT_OPENED,
  ]) {
    assert.ok(ALL_GOALS.includes(goal), `${goal} не в ALL_GOALS`);
  }
});

test("в Метрику не уходит ничего о человеке и его еде", () => {
  // Сведения о питании и теле мы обещали не передавать третьим лицам. Имя
  // события — единственное, что уходит; проверяем, что среди имён нет
  // ничего похожего на данные.
  for (const goal of ALL_GOALS) {
    assert.ok(!/kcal|ккал|weight|вес|kg|email|user_id|\d{3,}/.test(goal), `подозрительное имя: ${goal}`);
  }
});
