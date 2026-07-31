import test from "node:test";
import assert from "node:assert/strict";
import { validateApplication, CLIENTS_COUNT_OPTIONS } from "../lib/pro/application.ts";

test("пустой email отвергается как invalid_email", () => {
  // Нужно отклонить пустую строку, иначе неправильный браузер пришлёт её
  // и мы запишем в базу пустой адрес.
  const result = validateApplication({
    email: "",
    name: "Мария",
    consent: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_email");
});

test("email без @ отвергается", () => {
  // Минимальная проверка формата: должна быть собака и точка.
  const result = validateApplication({
    email: "invalid-email",
    name: "Мария",
    consent: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_email");
});

test("корректный email нормализуется и принимается", () => {
  // Проверяем, что валидный адрес проходит и приходит в lowercase.
  const result = validateApplication({
    email: "  Maria@Example.COM  ",
    name: "Мария",
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.email, "maria@example.com");
  }
});

test("пустое имя отвергается как no_name", () => {
  // Имя обязательно — без него не знаем, кто пишет.
  const result = validateApplication({
    email: "test@example.com",
    name: "",
    consent: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "no_name");
});

test("имя из одних пробелов отвергается", () => {
  // После trim() пробелы исчезают, остаётся пустая строка.
  const result = validateApplication({
    email: "test@example.com",
    name: "   ",
    consent: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "no_name");
});

test("без согласия заявка не проходит", () => {
  // Это персональные данные, согласие — обязательно. Никаких умолчаний.
  const result = validateApplication({
    email: "test@example.com",
    name: "Мария",
    consent: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "no_consent");
});

test("отсутствие поля consent тоже считается отказом", () => {
  // Если браузер не отправил галочку, это не значит согласие.
  const result = validateApplication({
    email: "test@example.com",
    name: "Мария",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "no_consent");
});

test("длинное имя обрезается, а не отбраковывается", () => {
  // Человек потратил время на заполнение — обрезаем, а не выбрасываем.
  // Лимит: 100 символов.
  const longName = "А".repeat(150);
  const result = validateApplication({
    email: "test@example.com",
    name: longName,
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.name.length, 100);
    assert.equal(result.fields.name, "А".repeat(100));
  }
});

test("пробелы в полях срезаются по краям", () => {
  // trim() должен убрать лишние пробелы в начале и конце каждого поля.
  const result = validateApplication({
    email: "  test@example.com  ",
    name: "  Мария  ",
    specialization: "  нутрициолог  ",
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.name, "Мария");
    assert.equal(result.fields.specialization, "нутрициолог");
  }
});

test("специализация обрезается до 100 символов", () => {
  // Лимит на специализацию: 100 символов. Проверяем обрезку.
  const longSpecialization = "В".repeat(150);
  const result = validateApplication({
    email: "test@example.com",
    name: "Мария",
    specialization: longSpecialization,
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.specialization.length, 100);
  }
});

test("город обрезается до 100 символов", () => {
  // Лимит на город: 100 символов.
  const longCity = "Г".repeat(150);
  const result = validateApplication({
    email: "test@example.com",
    name: "Мария",
    city: longCity,
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.city.length, 100);
  }
});

test("currentTools обрезается до 300 символов", () => {
  // Лимит больше: человек может описать несколько инструментов.
  const longTools = "Т".repeat(400);
  const result = validateApplication({
    email: "test@example.com",
    name: "Мария",
    currentTools: longTools,
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.currentTools.length, 300);
  }
});

test("комментарий обрезается до 1000 символов", () => {
  // Самый большой лимит: комментарий может быть развёрнутым.
  const longComment = "К".repeat(1500);
  const result = validateApplication({
    email: "test@example.com",
    name: "Мария",
    comment: longComment,
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.comment.length, 1000);
  }
});

test("необязательные поля можно не заполнять", () => {
  // Только email, имя и согласие — остальное опционально.
  const result = validateApplication({
    email: "test@example.com",
    name: "Мария",
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.specialization, "");
    assert.equal(result.fields.city, "");
    assert.equal(result.fields.clientsCount, "");
    assert.equal(result.fields.currentTools, "");
    assert.equal(result.fields.comment, "");
  }
});

test("clientsCount должен быть из известного списка", () => {
  // Если браузер пришлёт произвольное значение, обнулям это поле.
  const result = validateApplication({
    email: "test@example.com",
    name: "Мария",
    clientsCount: "очень много",
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.clientsCount, "");
  }
});

test("известный clientsCount принимается", () => {
  // Если значение совпадает с константой, берём как есть.
  const result = validateApplication({
    email: "test@example.com",
    name: "Мария",
    clientsCount: "5–15",
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.clientsCount, "5–15");
  }
});

test("все варианты из CLIENTS_COUNT_OPTIONS проходят валидацию", () => {
  // Проверяем, что ни один вариант из константы не выбросит заявку.
  for (const option of CLIENTS_COUNT_OPTIONS) {
    const result = validateApplication({
      email: "test@example.com",
      name: "Мария",
      clientsCount: option,
      consent: true,
    });
    assert.equal(result.ok, true, `вариант "${option}" должен проходить`);
    if (result.ok) {
      assert.equal(result.fields.clientsCount, option);
    }
  }
});

test("полная валидная заявка собирает все поля", () => {
  // Проверяем, что при полном заполнении все поля приходят в результат.
  const result = validateApplication({
    email: "  maria@example.com  ",
    name: "  Мария Сидорова  ",
    specialization: "  нутрициолог  ",
    city: "  Москва  ",
    clientsCount: "до 5",
    currentTools: "  Google Sheets, Telegram  ",
    comment: "  Ищу практикующего специалиста  ",
    consent: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.email, "maria@example.com");
    assert.equal(result.fields.name, "Мария Сидорова");
    assert.equal(result.fields.specialization, "нутрициолог");
    assert.equal(result.fields.city, "Москва");
    assert.equal(result.fields.clientsCount, "до 5");
    assert.equal(result.fields.currentTools, "Google Sheets, Telegram");
    assert.equal(result.fields.comment, "Ищу практикующего специалиста");
    assert.equal(result.fields.consent, true);
  }
});
