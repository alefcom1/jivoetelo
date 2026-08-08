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
  /**
   * Почта и пароль необязательны: у аккаунта, заведённого прямо в Telegram
   * Mini App, их нет вовсе. Личность там подтверждает подпись initData,
   * которую ставит сам Telegram, — этого достаточно, чтобы понять, чей это
   * дневник.
   *
   * Соблазн подставить что-нибудь вроде `tg-12345@telegram.local` был, и он
   * ошибочный: такой адрес выглядит как адрес. Он попадёт в выгрузку, кто-то
   * однажды отправит на него письмо, а форма входа примет его как логин.
   * Пустое поле честнее и ничего из этого не позволяет.
   *
   * Уникальность сохраняется: PostgreSQL не считает NULL повтором, поэтому
   * безадресных аккаунтов может быть сколько угодно, а один адрес — по-прежнему
   * у одного человека.
   */
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  // Привязка Telegram-аккаунта для Mini App (раздел 17 спеки).
  telegramUserId: text("telegram_user_id").unique(),
  // Тариф. Сейчас все функции бесплатны и все пользователи на "free";
  // поле — задел под будущие тарифы, чтобы не мигрировать данные потом.
  plan: text("plan").notNull().default("free"),
  /**
   * Фото профиля — ключ файла в хранилище снимков (lib/storage.ts), а не сам
   * файл. Владелец виден из ключа: он начинается с идентификатора
   * пользователя, и на этом держится проверка доступа к картинке.
   *
   * null — фото нет, интерфейс рисует монограмму из адреса почты.
   */
  avatarKey: text("avatar_key"),
  // Режим «скрыть калории» (раздел 4.2 спеки): пользователь видит белок и
  // клетчатку, но не цифры энергии.
  showCalories: boolean("show_calories").notNull().default(true),
  /**
   * Упрощённый режим учёта (lib/simple-log.ts): тарелка вместо чисел.
   *
   * Отдельно от showCalories сознательно. Тот убирает цифры с экрана,
   * оставляя полный ввод; этот упрощает саму работу. Человек может хотеть
   * одно без другого — видеть калории, но не набирать состав руками.
   */
  simpleMode: boolean("simple_mode").notNull().default(false),
  /**
   * Пройденные объяснения первых шагов — массив ключей из lib/first-run.ts.
   *
   * Массив, а не столбец на каждый шаг: шагов семь, и каждый новый иначе
   * стоил бы миграции. Отметка ставится и когда человек закрыл подсказку, и
   * когда он сделал действие сам, не увидев её.
   */
  firstRunHints: jsonb("first_run_hints").notNull().default([]).$type<string[]>(),
  /**
   * Код приглашения — хвост ссылки t.me/<бот>?start=ref_<код>.
   *
   * Пусто до первого нажатия «Позвать друга»: заводить код всем заранее нечего,
   * а миграция по живой таблице тем более. Уникален среди существующих —
   * частичный индекс в drizzle/0023.
   */
  referralCode: text("referral_code"),
  /**
   * Кто пригласил. Ссылка на человека, а не копия кода: код можно перевыпустить,
   * а факт «пришёл от него» — нет.
   */
  invitedBy: integer("invited_by"),
  /**
   * До какого момента открыт платный доступ. `null` — никогда не открывался.
   *
   * Источник истины один на оплату и на ваучеры; `plan` из него вычисляется
   * (lib/paid.ts) и больше нигде не пишется. Флаг вместо срока пришлось бы
   * снимать по расписанию, и упавший cron оставлял бы доступ неоплаченным.
   */
  accessUntil: timestamp("access_until", { withTimezone: true }),
  /**
   * Когда начислена награда за приглашение. Отметка стоит у ПРИГЛАШЁННОГО:
   * у него она одна на всю жизнь, у пригласившего их было бы столько,
   * сколько друзей. Условие `IS NULL` в WHERE делает начисление однократным.
   */
  referralRewardedAt: timestamp("referral_rewarded_at", { withTimezone: true }),
  /**
   * «Не предлагать публиковать мои фотографии».
   *
   * По умолчанию `false`: снимок можно **предложить**. Сама публикация
   * по-прежнему требует ответа «да» на конкретный кадр — молчание согласием
   * на распространение не считается (152-ФЗ, ст. 10.1 ч. 8). Этот флаг
   * выключает сам вопрос: человек, который его поставил, не увидит
   * предложений, а его снимки не попадут даже в очередь кандидатов у
   * модератора.
   */
  photoOffersOptOut: boolean("photo_offers_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Ваучеры: код на бесплатный доступ.
 *
 * Строка живёт и после погашения — по ней отвечают на вопрос «кому и когда мы
 * это выдали», а он возникает не в день выдачи.
 */
export const vouchers = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  /** Канонический вид: заглавные, без дефиса (lib/vouchers.ts). */
  code: text("code").notNull().unique(),
  /** Днями, а не тарифом: тариф подорожает, а обещание «месяц» уже роздано. */
  days: integer("days").notNull(),
  /** Кто выдал. null — начислено автоматически за приглашение. */
  issuedBy: integer("issued_by"),
  /** Кому предназначен, если известно заранее. */
  issuedTo: integer("issued_to"),
  note: text("note"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  usedBy: integer("used_by"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Журнал обращений администратора к персональным данным.
 *
 * Доступ полный — так решено владельцем. Журнал его не ограничивает, а
 * записывает: при жалобе или проверке спрашивают именно «кто и когда
 * смотрел». Сводные цифры сюда не идут — в них нет ничьего дневника.
 */
export const adminAccessLog = pgTable("admin_access_log", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id"),
  /** profile | diary | photos */
  scope: text("scope").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Взятые награды (lib/awards.ts). Строка на награду, не удаляется никогда:
 * награда, которую можно потерять, наказывает за болезнь и отпуск.
 */
export const userAwards = pgTable(
  "user_awards",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    awardKey: text("award_key").notNull(),
    earnedOn: date("earned_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // «Сегодня» открыто в вебе и в Mini App разом, и оба экрана считают взятое
  // при загрузке: без уникальности награда задвоится.
  (table) => [uniqueIndex("user_awards_user_key").on(table.userId, table.awardKey)],
);

/**
 * Приглашение, пришедшее раньше аккаунта.
 *
 * По ссылке человек попадает в чат с ботом, а запись в users заводится позже —
 * при регистрации в Mini App. Между этими двумя событиями приглашение негде
 * держать: users ещё нет, а initData о ссылке в чат уже не знает. Ключ —
 * telegram_user_id, единственное, что известно по обе стороны разрыва.
 */
export const pendingInvites = pgTable("pending_invites", {
  telegramUserId: text("telegram_user_id").primaryKey(),
  inviterId: integer("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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
  /**
   * Своя норма калорий вместо расчётной: её назначил врач, тренер или сам
   * человек. NULL — законное состояние и умолчание: «считай по формуле».
   *
   * Отменяет расчёт целиком, а не правит его. Этим отличается от
   * kcalAdjustment выше: та — накопленная адаптивная поправка, которую сервис
   * предлагает сам и которая формулу уточняет. Обе могут быть заполнены
   * одновременно; тогда adjustment просто не участвует (lib/targets.ts).
   */
  kcalOverride: integer("kcal_override"),
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
    kind: text("kind").notNull(), // analyze_photo | analyze_text | suggest | transcribe
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
  /**
   * Кому зачли. Нулевой намеренно: Tribute — посредник, и покупатель у него
   * не обязан совпасть с нашим аккаунтом. Платёж без человека не теряется, а
   * ждёт в админке привязки руками.
   */
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  sum: text("sum").notNull(),
  status: text("status").notNull(), // checked | paid | failed | refunded
  /** Ключ тарифа: цены меняются, а выданные дни остаются. */
  tariff: text("tariff"),
  /** Как нашли человека: ref | telegram | email | manual. */
  matchedBy: text("matched_by"),
  /** Когда доступ действительно продлили. Пусто — деньги есть, доступа нет. */
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Сырые уведомления платёжного сервиса — до того, как из них что-то поняли.
 *
 * Заведена под Tribute, документация которого из нашей среды недоступна:
 * имена полей в обработчике восстановлены по вторичным источникам, и первое
 * настоящее уведомление здесь и есть та спецификация, которой у нас нет.
 * Хранится всё, включая не прошедшее проверку подписи, — иначе непонятно,
 * почему деньги у провайдера есть, а доступа у человека нет.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull().default("tribute"),
    /** Доступ выдаётся только по проверенным подписью. */
    verified: boolean("verified").notNull().default(false),
    eventType: text("event_type"),
    externalId: text("external_id"),
    raw: jsonb("raw"),
    headers: jsonb("headers"),
    /** applied | unmatched | ignored | bad_signature | disabled */
    outcome: text("outcome").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payment_events_created").on(table.createdAt)],
);

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
    // null у расшифрованного голосового: файла у него нет, а содержимое —
    // текст в note. Это же и признак «запись голосом», отдельного столбца
    // под него нет (см. drizzle/0018_voice-inbox.sql).
    photoKey: text("photo_key"),
    // Подпись к фото в Telegram, если она была: «омлет с сыром» экономит
    // потом целый раунд уточнений. У голосового здесь вся расшифровка.
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
/**
 * Состояние бота — одна строка на сервис, видимая из админки.
 *
 * В памяти процесса держать нельзя: цикл опроса поднимает instrumentation.ts,
 * страницу рендерит серверный компонент, и Next собирает их в разные бандлы —
 * модуль состояния оказывается в двух экземплярах. Подробности и как это
 * поймали — в lib/bot/health-store.ts.
 */
export const botHealth = pgTable("bot_health", {
  // Строка ровно одна; единственность держит CHECK в миграции 0028.
  id: integer("id").primaryKey().default(1),
  transport: text("transport"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  lastPollAt: timestamp("last_poll_at", { withTimezone: true }),
  lastUpdateAt: timestamp("last_update_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  notStartedReason: text("not_started_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botPreferences = pgTable("bot_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  // Час по местному времени продукта, в который приходит вечерний дайджест.
  digestHour: integer("digest_hour").notNull().default(20),
  /**
   * Утреннее напоминание взвеситься — отдельный переключатель.
   *
   * Не часть `remindersEnabled` сознательно: /stop выключает разговор про
   * еду, и человек, нажавший его, не соглашался вместо этого получать «пора
   * на весы». Обратное тоже верно — вести дневник, не взвешиваясь, законно.
   */
  weighRemindersEnabled: boolean("weigh_reminders_enabled").notNull().default(true),
  /** Дата последнего напоминания о весе — не чаще раза в неделю. */
  lastWeighReminderOn: date("last_weigh_reminder_on"),
  /**
   * Когда предупредили о конце пробного месяца. Сообщение одноразовое, и
   * «отправляли ли уже» неоткуда узнать, кроме как записав. Дата, а не флаг:
   * по ней видно, когда именно, а это первый вопрос, если человек говорит
   * «мне ничего не приходило».
   */
  trialWarningOn: date("trial_warning_on"),
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
  /**
   * Канонический ключ блюда (lib/dish-key.ts): `dish:ovsyanka` или `cat:cereal`.
   *
   * Нужен потому, что `name` — свободный текст от разбора снимка, и одна и та
   * же тарелка называется каждый раз по-новому. Без устойчивого ключа у любого
   * блюда в статистике будет n = 1 — это уже проверено на «как обычно?»
   * (см. комментарий к repeatableMeals в lib/frequent-meals.ts).
   *
   * Nullable означает «ключ ещё не проставлен»: так выглядят записи, сделанные
   * до миграции 0015. У опознанного, но неизвестного блюда ключ не пустой, а
   * `cat:other`, и путать эти два состояния нельзя.
   */
  dishKey: text("dish_key"),
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
  /**
   * pending | approved | rejected | suspended.
   *
   * Отвечает на один вопрос: может ли этот человек работать в кабинете.
   * `approved` теперь значит «может», а не «мы его одобрили»: при
   * самостоятельной регистрации строка сразу создаётся с ним, потому что
   * кабинет сам по себе не открывает ни одного байта чужих данных — он
   * позволяет выдать код, а что откроется, решает клиент.
   *
   * `pending` остаётся у строк прежнего, ручного пути и означает «заведён,
   * но работать ещё не пускали».
   */
  status: text("status").notNull().default("pending"),
  /**
   * Когда специалиста подтвердил человек. `null` — зарегистрировался сам.
   *
   * Отдельно от `status` сознательно: «может работать» и «мы проверили, что
   * за именем стоит практика» — разные вопросы, и склеивать их значит либо
   * держать людей в очереди без нужды, либо выдавать непроверенного за
   * проверенного. Клиент видит эту разницу на экране согласия.
   */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
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

/**
 * Настройки недельных и месячных отчётов. Строки может не быть — это
 * нормально и означает «всё по умолчанию» (lib/report-prefs.ts). Заводить её
 * каждому при регистрации незачем: большинство настройки не трогает.
 */
export const reportPreferences = pgTable("report_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** auto | email | telegram | both | off */
  weekly: text("weekly").notNull().default("auto"),
  monthly: text("monthly").notNull().default("auto"),
  weightNumbers: boolean("weight_numbers").notNull().default(true),
  /**
   * Токен для заголовка List-Unsubscribe (RFC 8058). Nullable: строка
   * настроек заводится и без него — токен появляется при первом письме.
   */
  unsubscribeToken: text("unsubscribe_token"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Журнал отправленных отчётов — он же защита от повторной отправки.
 *
 * Отдельно от `email_deliveries`: та привязана к анонимным подписчикам
 * почтовой серии (`email_subscribers`), у которых нет `user_id`, и её
 * обработчик при неожиданном содержимом навсегда прекращает попытки.
 *
 * Строки не создаются заранее, как у серии писем: период сначала должен
 * закончиться. Планировщик вставляет строку через ON CONFLICT DO NOTHING —
 * выигравший гонку получает право отправить, остальные не получают ничего.
 */
export const reportDeliveries = pgTable(
  "report_deliveries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** weekly | monthly */
    kind: text("kind").notNull(),
    /**
     * Последний день периода. Именно он определяет тождество отчёта: отправка
     * может сдвинуться на сутки из-за перезапуска, отчёт от этого другим не
     * станет.
     */
    periodEnd: date("period_end").notNull(),
    /** email | telegram */
    channel: text("channel").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("report_deliveries_once").on(table.userId, table.kind, table.periodEnd, table.channel),
    index("report_deliveries_due").on(table.sentAt, table.createdAt),
  ],
);

/**
 * Своя база штрихкодов.
 *
 * Единой открытой базы штрихкодов российских продуктов с составом не
 * существует, поэтому база собирается из того, что вводят люди: отсканировал,
 * не нашлось, ввёл КБЖУ с упаковки — и следующий, кто отсканирует ту же
 * пачку, получит её сразу.
 *
 * Ключ — сам код, без суррогатного id: товар с этим кодом ровно один, и
 * второй ключ позволил бы завести его дважды.
 */
export const barcodes = pgTable(
  "barcodes",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    kcalPer100: doublePrecision("kcal_per_100").notNull().default(0),
    proteinPer100: doublePrecision("protein_per_100").notNull().default(0),
    fatPer100: doublePrecision("fat_per_100").notNull().default(0),
    carbsPer100: doublePrecision("carbs_per_100").notNull().default(0),
    fiberPer100: doublePrecision("fiber_per_100").notNull().default(0),
    /** Вес пачки. Ноль — «не знаем», тогда подставляем сто грамм. */
    portionG: doublePrecision("portion_g").notNull().default(0),
    /** Кто завёл. Человек уходит — товар остаётся: он принадлежит не ему. */
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    /**
     * Сколько раз карточку подтвердили, сохранив по ней еду без правки чисел.
     * Ноль отличает проверенную запись от заведённой однажды и наугад.
     */
    confirmations: integer("confirmations").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("barcodes_name").on(table.name)],
);

/**
 * Фотографии продуктов, присланные людьми, — для публичного каталога.
 *
 * Почему это отдельная таблица, а не флаг на `meals`. Снимок в дневнике и
 * снимок в каталоге — разные вещи по назначению и по правовому основанию.
 * Первый человек сделал для себя, и мы обрабатываем его, чтобы посчитать
 * еду. Второй уходит на публичную страницу, которую увидит кто угодно, и
 * это отдельная цель обработки, требующая отдельного согласия. Смешать их в
 * одной строке значило бы однажды опубликовать первое вместо второго.
 *
 * Показывать снимок можно только когда сошлись три условия: он проверен
 * (`status = 'approved'`), согласие на публикацию не отозвано, и аккаунт не
 * удалён. Первое — здесь, второе — в `user_consents`, третье обеспечивает
 * каскад: удаление аккаунта уносит и вклад в каталог.
 *
 * Модерация обязательна и не автоматизируется. На снимке еды регулярно
 * оказывается то, чего человек не имел в виду публиковать: лица за столом,
 * интерьер кухни, документы и бумаги рядом с тарелкой, отражения в посуде.
 */
export const catalogPhotos = pgTable(
  "catalog_photos",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Slug продукта из `lib/products.ts`. */
    productSlug: text("product_slug").notNull(),
    photoKey: text("photo_key").notNull(),
    /**
     * Подпись — то, что увидят и человек, и поисковик: она идёт в `alt`, в
     * `title`, в видимую подпись под снимком и в `ImageObject.caption`.
     * Хранится готовой строкой, потому что её проверяет модератор: подпись
     * публикуется вместе со снимком и врать в ней нельзя.
     */
    caption: text("caption").notNull(),
    /** pending | approved | rejected */
    status: text("status").notNull().default("pending"),
    /** Причина отказа — её читает автор. */
    rejectionReason: text("rejection_reason"),
    /**
     * Внутренняя заметка модератора: «лицо в отражении», «дубль вчерашнего».
     * Отдельно от причины отказа сознательно — первое автор прочитает,
     * второе не должен.
     */
    moderatorNote: text("moderator_note"),
    /**
     * Когда решение ушло автору. `null` — не отправляли. Без этого признака
     * повторный разбор очереди слал бы одно и то же сообщение дважды.
     */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    /**
     * Редакция документов на момент согласия. Та же логика, что в
     * `user_consents`: через год надо уметь показать, на что именно человек
     * соглашался, а не на что соглашаются сегодня.
     */
    /**
     * `null` до ответа автора: у предложенного снимка согласия ещё нет.
     * Пустая строка была бы враньём в поле, по которому через год отвечают,
     * на какую редакцию человек соглашался.
     */
    consentVersion: text("consent_version"),
    /** Кто из модераторов предложил снимок. `null` — автор отправил сам. */
    offeredBy: integer("offered_by").references(() => users.id, { onDelete: "set null" }),
    offeredAt: timestamp("offered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("catalog_photos_slug_status").on(table.productSlug, table.status),
    index("catalog_photos_user").on(table.userId),
    // Очередь кандидатов обходит снимки дневника и обязана отсеивать те,
    // что уже предлагали, — вопрос «этот ключ уже здесь?» задаётся часто.
    index("catalog_photos_key").on(table.photoKey),
  ],
);

/**
 * ## Журнал выпитого
 *
 * Одна строка на один глоток, а не одна на день с накопленной суммой. Разница
 * не техническая: у веса (`weight_entries`) измерение за день одно и новое
 * заменяет старое — там upsert по (user, date) честен. Жидкость набирается
 * весь день по чашке, и «сумма за день» — это следствие записей, а не сама
 * запись.
 *
 * Из журнала бесплатно получаются две вещи, которых у накопительной суммы
 * нет: **отмена последней записи** (промахнулись кнопкой — убрали ровно
 * последнее, а не «отнимите 250 сами») и возможность когда-нибудь показать
 * распределение по времени суток. Второе мы пока не показываем и не обещаем.
 *
 * `onDate` — тот же «локальный день пользователя», что у `meals.eaten_on`:
 * день группируется по тому, который человек видел на своих часах.
 */
export const waterEntries = pgTable(
  "water_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    /**
     * Объём в миллилитрах. Целое: обещать жидкость с точностью до десятых
     * миллилитра было бы той же псевдоточностью, против которой заведён и
     * сам расчёт нормы (lib/water.ts).
     */
    ml: integer("ml").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Единственный частый вопрос к таблице — «сколько за этот день у этого
    // человека», и он же обслуживает отмену последней записи.
    index("water_entries_user_date").on(table.userId, table.onDate),
  ],
);
