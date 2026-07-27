import { boolean, date, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const waitlistSubscribers = pgTable("waitlist_subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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
