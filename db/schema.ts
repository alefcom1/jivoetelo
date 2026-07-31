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
  // Выбранный на онбординге темп снижения веса (lib/pace.ts, PaceKey) —
  // осознанная цель по дефициту, заданная пользователем на старте. Nullable
  // не потому что забыли заполнить: для целей «поддержание»/«набор массы» и
  // для профилей, заведённых до онбординга v2, темпа нет и не будет — это
  // законное состояние, а не пропуск. Не путать с kcalAdjustment ниже: это
  // разные сущности с разной судьбой (раздел 14.2 не про это поле).
  pace: text("pace"),
  // Накопленная адаптивная корректировка стартовой цели (раздел 14.2 спеки).
  // Меняется только с явного подтверждения пользователя через
  // applyProposedAdjustment — онбординг это поле не трогает.
  kcalAdjustment: integer("kcal_adjustment").notNull().default(0),
  // Целевой вес (экран «Профиль», Mini App v2). В отличие от kcalAdjustment
  // это желаемое пользователем, а не измеренный факт, поэтому поле
  // необязательное: план по калориям считается и без него. Темп лежит
  // выше, в `pace` — он приходит из онбординга, а профиль его лишь правит.
  targetWeightKg: doublePrecision("target_weight_kg"),
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

/**
 * Фото-инбокс: снимок, присланный боту в любой момент дня, попадает сюда, а
 * не сразу в дневник. Разбор откладывается на вечер — в этом весь смысл:
 * сфотографировать можно за секунду, а отвечать на уточняющие вопросы
 * посреди обеда никто не станет.
 *
 * Состояние строки читается по двум полям: пока `processedAt` и `dismissedAt`
 * пусты, фото ждёт разбора. Разобранное получает `mealId`, отклонённое —
 * `dismissedAt`. Отдельного статуса нет намеренно: два времени всегда
 * согласованы с фактом, а строковый статус пришлось бы держать в синхроне.
 */
export const photoInbox = pgTable(
  "photo_inbox",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    photoKey: text("photo_key").notNull(),
    // Подпись к фото в Telegram, если она была: «омлет с сыром» экономит
    // потом целый раунд уточнений.
    note: text("note"),
    // Локальные дата и время съёмки. Сохраняем их сразу, иначе фото,
    // присланное в 23:50 и разобранное в 00:10, уедет на следующий день.
    takenOn: date("taken_on").notNull(),
    takenTime: text("taken_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    // Приём пищи, в который превратилось фото. При удалении приёма пищи
    // связь обнуляется, а строка инбокса остаётся историей.
    mealId: integer("meal_id").references(() => meals.id, { onDelete: "set null" }),
  },
  (table) => [index("photo_inbox_user_pending").on(table.userId, table.createdAt)],
);

/**
 * Настройки бота и следы уже отправленных сообщений. Второе здесь не ради
 * статистики: планировщик решает «отправлять ли сегодня» именно по этим
 * полям, и запись даты — это захват права на отправку, а не отчёт о ней.
 */
export const botPreferences = pgTable("bot_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  // Час по местному времени продукта, в который приходит вечерний дайджест.
  digestHour: integer("digest_hour").notNull().default(20),
  // «Напомнить позже»: до этого момента бот молчит.
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  // Дата последнего отправленного напоминания — не больше одного в день.
  lastReminderOn: date("last_reminder_on"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Подписчики почтовой серии после калькулятора. Отдельно от
 * `waitlist_subscribers`: там ожидание приглашения, здесь — серия писем,
 * и отписка должна работать независимо.
 */
export const emailSubscribers = pgTable("email_subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  // Откуда пришёл адрес: raschet_energiya | raschet_belok | raschet_temp |
  // raschet_kviz | skolko_kalorij:<слаг блюда>. У страниц блюд источников
  // по числу блюд — слаг после двоеточия и показывает, какая именно
  // страница привела подписчика (lib/email-subscribe.ts).
  source: text("source").notNull(),
  consentVersion: text("consent_version"),
  // Секрет для ссылки отписки. Одноразовым его делать нельзя: ссылка живёт
  // во всех письмах серии и должна работать всегда.
  unsubscribeToken: text("unsubscribe_token").notNull().unique(),
  // Данные расчёта, чтобы первое письмо повторяло увиденные цифры. У
  // калькулятора без чисел (квиз) и у страницы блюда — пустой объект.
  context: jsonb("context"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
});

/**
 * По строке на каждое письмо серии. Строки создаются сразу при подписке — все
 * три, с рассчитанными сроками. Планировщику тогда достаточно спросить «что
 * пора отправить», а не пересчитывать серию заново для каждого подписчика.
 *
 * `claimedAt` — метка «взято в работу»: письмо отправляется вне транзакции,
 * и без такой метки перезапуск контейнера в неудачный момент отправил бы его
 * дважды. Просроченный захват (старше 15 минут) считается неудачным.
 */
export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: serial("id").primaryKey(),
    subscriberId: integer("subscriber_id")
      .notNull()
      .references(() => emailSubscribers.id, { onDelete: "cascade" }),
    letter: integer("letter").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("email_deliveries_subscriber_letter").on(table.subscriberId, table.letter),
    index("email_deliveries_due").on(table.sentAt, table.scheduledFor),
  ],
);

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

/**
 * ## Живое Тело Про — доступ специалиста к данным клиента
 *
 * Четыре таблицы ниже описывают одну вещь: **специалист видит данные клиента
 * только потому, что клиент явно это разрешил, и ровно столько, сколько
 * разрешил.** Всё остальное — детали этой мысли.
 *
 * Почему не роль в `users` и не флаг «Pro». Роль отвечает на вопрос «кто он»,
 * а нам нужен ответ на вопрос «кто кому что показал». Это отношение, у него
 * есть срок, объём и история, и оно принадлежит клиенту, а не специалисту.
 */

/**
 * Профиль специалиста. Отдельно от `users`, потому что специалист — это тот
 * же человек с тем же входом: у нутрициолога есть и собственный дневник.
 *
 * `status` не декоративный: до подтверждения специалист не может пригласить
 * ни одного клиента. Мы пускаем в пилот руками, и это осознанно —
 * саморегистрация «специалистом» кого угодно в продукте, где на кону данные
 * о питании и весе чужих людей, стоила бы дороже любого роста.
 */
export const specialists = pgTable("specialists", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  // Чем занимается: «нутрициолог», «диетолог», «тренер». Свободный текст —
  // список профессий в этой отрасли не устоялся, и выбор из справочника
  // заставил бы половину выбирать «другое».
  specialization: text("specialization"),
  city: text("city"),
  about: text("about"),
  // pending | approved | rejected | suspended
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

/**
 * Одноразовый код приглашения. Специалист называет код клиенту, клиент
 * вводит его у себя — и только тогда видит экран согласия.
 *
 * Почему приглашение идёт от специалиста к клиенту, а не наоборот: клиент
 * не должен искать специалиста по базе и не должен вводить чужой email.
 * Код живёт коротко и гасится при использовании — как коды привязки
 * Telegram, и по тем же причинам.
 */
export const specialistInvites = pgTable("specialist_invites", {
  code: text("code").primaryKey(),
  specialistUserId: integer("specialist_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: integer("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Связь «специалист — клиент» и объём доступа.
 *
 * Строка не удаляется при отзыве: `revokedAt` ставится, доступ прекращается
 * немедленно, а запись остаётся историей. Удалять её значило бы стирать
 * ответ на вопрос «а кто вообще видел мои данные в марте» — ровно то, ради
 * чего ведётся журнал ниже.
 *
 * Объём хранится тремя булевыми полями, а не строкой-перечислением: клиент
 * отмечает галочки, и «итоги без дневника» — обычный выбор, а не крайний
 * случай. Ни одно поле не включено по умолчанию.
 */
export const specialistClients = pgTable(
  "specialist_clients",
  {
    id: serial("id").primaryKey(),
    specialistUserId: integer("specialist_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientUserId: integer("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Как клиент просит себя называть у этого специалиста.
     *
     * Здесь, а не в профиле, по двум причинам. Специалист не должен видеть
     * почту клиента: адрес — это способ связи и опознания в других сервисах,
     * а для работы достаточно имени. И имя даётся конкретному специалисту:
     * у врача человек может быть «Анна Петровна», у тренера — «Аня».
     */
    clientName: text("client_name"),
    // Недельные итоги: энергия, макросы, регулярность. Минимальный объём.
    shareSummary: boolean("share_summary").notNull().default(false),
    // Дневник по дням: что и когда ел, с фотографиями.
    shareDiary: boolean("share_diary").notNull().default(false),
    // Вес и тренд.
    shareWeight: boolean("share_weight").notNull().default(false),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Одна действующая связь на пару. Повторное приглашение обновляет объём,
    // а не заводит вторую строку с другими галочками.
    uniqueIndex("specialist_clients_pair").on(table.specialistUserId, table.clientUserId),
    index("specialist_clients_by_specialist").on(table.specialistUserId, table.revokedAt),
    index("specialist_clients_by_client").on(table.clientUserId, table.revokedAt),
  ],
);

/**
 * Журнал доступа: кто, когда и что открыл.
 *
 * Пишется на каждое чтение данных клиента и показывается **клиенту**, а не
 * специалисту. Это не аудит для нас — это то, что превращает обещание
 * «данные ваши» в проверяемое утверждение. Человек должен иметь возможность
 * увидеть строку «11 августа, 14:20 — открыт дневник за неделю» и сопоставить
 * её со своими ожиданиями.
 */
export const specialistAccessLog = pgTable(
  "specialist_access_log",
  {
    id: serial("id").primaryKey(),
    specialistUserId: integer("specialist_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientUserId: integer("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // summary | diary | weight — что именно смотрели.
    scope: text("scope").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("specialist_access_log_by_client").on(table.clientUserId, table.at)],
);

/**
 * Заявка в пилотную группу Про со страницы /pro.
 *
 * Отдельно от `waitlist_subscribers`: там ожидание приглашения в основной
 * продукт, здесь — кастдев-анкета специалиста, и поля у неё свои. Смешивать
 * их значило бы получить таблицу, где половина колонок всегда пуста.
 */
export const proApplications = pgTable("pro_applications", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  specialization: text("specialization"),
  city: text("city"),
  // Сколько клиентов ведёт сейчас — главный вопрос анкеты: он отделяет
  // практикующего специалиста от интересующегося.
  clientsCount: text("clients_count"),
  // Чем пользуется сейчас: таблицы, мессенджеры, другой сервис.
  currentTools: text("current_tools"),
  comment: text("comment"),
  consentVersion: text("consent_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Одноразовые ссылки смены пароля.
 *
 * Отдельная таблица, а не колонка в `users`: у одного человека может быть
 * несколько запросов подряд (не пришло письмо, нажал ещё раз), и каждый
 * должен гаситься сам по себе. Колонка хранила бы только последний.
 *
 * Храним хеш токена, а не токен — как у сессий: утечка базы не должна давать
 * готовых ключей к чужим аккаунтам.
 */
export const passwordResets = pgTable(
  "password_resets",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // По пользователю — чтобы ограничивать частоту запросов, не сканируя таблицу.
  (table) => [index("password_resets_user").on(table.userId, table.createdAt)],
);
