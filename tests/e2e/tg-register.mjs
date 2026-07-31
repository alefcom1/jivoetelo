/** Регистрация из Mini App против настоящей базы. */
import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { userConsents, users } from "@/db/schema";
import { findUserByTelegram } from "@/lib/telegram";
import { hashPassword } from "@/lib/password";

const db = getDb();
let bad = 0;
const check = (ok, label, extra = "") => { if (!ok) bad += 1; console.log(`${ok ? "ok  " : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`); };

// Ровно то, что делает маршрут: аккаунт без почты и пароля + два согласия.
const [a] = await db.insert(users).values({ telegramUserId: "555001" }).returning({ id: users.id });
await db.insert(userConsents).values([
  { userId: a.id, kind: "terms", version: "1.2", source: "telegram" },
  { userId: a.id, kind: "ai_processing", version: "1.2", source: "telegram" },
]);

const row = (await db.select().from(users).where(eq(users.id, a.id)))[0];
check(row.email === null, "аккаунт заведён без почты", `email = ${JSON.stringify(row.email)}`);
check(row.passwordHash === null, "и без пароля");
check((await findUserByTelegram("555001"))?.id === a.id, "находится по подписи Telegram");

const consents = await db.select().from(userConsents).where(eq(userConsents.userId, a.id));
check(consents.length === 2, "оба согласия записаны", `их ${consents.length}`);
check(consents.every((c) => c.source === "telegram"), "с пометкой источника telegram");

// Второй безадресный аккаунт: NULL не считается повтором уникального индекса.
const [b] = await db.insert(users).values({ telegramUserId: "555002" }).returning({ id: users.id });
check(b.id !== a.id, "второй безадресный аккаунт заводится");
check((await db.select().from(users).where(isNull(users.email))).length === 2, "оба лежат без почты");

// А вот повтор telegram_user_id уникальный индекс обязан поймать.
let dup = false;
try { await db.insert(users).values({ telegramUserId: "555001" }); } catch { dup = true; }
check(dup, "повторная регистрация того же Telegram отбивается базой");

// Обычный аккаунт с почтой продолжает работать рядом.
const [c] = await db.insert(users)
  .values({ email: "web@x.ru", passwordHash: await hashPassword("пароль123") })
  .returning({ id: users.id });
check(c.id > 0, "веб-регистрация не сломалась");
let dupEmail = false;
try { await db.insert(users).values({ email: "web@x.ru", passwordHash: "h" }); } catch { dupEmail = true; }
check(dupEmail, "и уникальность почты по-прежнему держится");

console.log(bad === 0 ? "\n=== РЕГИСТРАЦИЯ ИЗ MINI APP СОШЛАСЬ ===" : `\n=== РАСХОЖДЕНИЙ: ${bad} ===`);
process.exit(bad === 0 ? 0 : 1);
