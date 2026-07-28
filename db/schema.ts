import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const waitlistSubscribers = pgTable("waitlist_subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  // Версия документов, на которую человек согласился, оставляя адрес.
  // Оператор обязан уметь показать, под чем именно стоит галочка.
  consentVersion: text("consent_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Журнал согласий (152-ФЗ). Одна строка — одно согласие конкретной редакции
 * документа. Строки не перезаписываются: отозванное согласие получает
 * withdrawnAt, а не исчезает, иначе нечего будет предъявить при проверке.
 */
export const userConsents = pgTable(
  "user_consents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // terms | ai_processing
    version: text("version").notNull(),
    source: text("source").notNull().default("web"), // web | telegram
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [index("user_consents_user_kind").on(table.userId, table.kind)],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Привязка Telegram-аккаунта для Mini App (раздел 17 спеки).
  telegramUserId: text("telegram_user_id").unique(),
  // Тариф. Сейчас все функции бесплатны и все пользователи на "free";
  // поле — задел под будущие тарифы, чтобы не мигрировать данные потом.
  plan: text("plan").notNull().default("free"),
  // Режим «скрыть калории» (раздел 4.2 спеки): пользователь видит белок и
  // клетчатку, но не цифры энергии.
  showCalories: boolean("show_calories").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  // Храним только SHA-256 от токена: утечка базы не даёт готовых кук.
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Одноразовые коды привязки Telegram: пользователь генерирует код в веб-профиле
 * и подтверждает им вход в Mini App, не вводя пароль внутри Telegram.
 */
export const telegramLinkCodes = pgTable("telegram_link_codes", {
  code: text("code").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meals = pgTable("meals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Дата и время в «локальном» виде пользователя, без таймзонных пересчётов:
  // день группируется по тому дню, который пользователь видел на своих часах.
  eatenOn: date("eaten_on").notNull(),
  eatenTime: text("eaten_time").notNull(),
  mealType: text("meal_type").notNull(),
  sourceText: text("source_text"),
  photoKey: text("photo_key"),
  // Снимок исходного AI-разбора до правок пользователя — для отладки качества
  // и будущей персонализации (раздел 15.4 спеки).
  analysis: jsonb("analysis"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  goal: text("goal").notNull(), // lose | maintain | gain
  // Пол для формулы Миффлина-Сан Жеора; в интерфейсе поясняем, зачем он нужен.
  sexForFormula: text("sex_for_formula").notNull(), // female | male
  birthYear: integer("birth_year").notNull(),
  heightCm: doublePrecision("height_cm").notNull(),
  activity: text("activity").notNull(), // sedentary | light | moderate | high
  // Накопленная адаптивная корректировка стартовой цели (раздел 14.2 спеки).
  // Меняется только с явного подтверждения пользователя.
  kcalAdjustment: integer("kcal_adjustment").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const weightEntries = pgTable(
  "weight_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("weight_entries_user_date").on(table.userId, table.onDate)],
);

/**
 * Журнал обращений к AI: одна строка на вызов. Нужен для дневных лимитов,
 * глобального предохранителя по стоимости и понимания реальной юнит-экономики
 * до того, как включать тарифы.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    kind: text("kind").notNull(), // analyze_photo | analyze_text | suggest
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ai_usage_user_date").on(table.userId, table.onDate)],
);

/**
 * Платежи Unitpay. Таблица заведена заранее: приём оплаты выключен, но когда
 * включим — идемпотентность уже обеспечена уникальным unitpay_id (повторный
 * CHECK/PAY не должен зачислять дважды).
 */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("unitpay"),
  externalId: text("external_id").notNull().unique(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  sum: text("sum").notNull(),
  status: text("status").notNull(), // checked | paid | failed
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mealItems = pgTable("meal_items", {
  id: serial("id").primaryKey(),
  mealId: integer("meal_id")
    .notNull()
    .references(() => meals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  grams: doublePrecision("grams").notNull(),
  kcalPer100: doublePrecision("kcal_per_100").notNull().default(0),
  proteinPer100: doublePrecision("protein_per_100").notNull().default(0),
  fatPer100: doublePrecision("fat_per_100").notNull().default(0),
  carbsPer100: doublePrecision("carbs_per_100").notNull().default(0),
  fiberPer100: doublePrecision("fiber_per_100").notNull().default(0),
  confidence: text("confidence").notNull().default("medium"),
});
