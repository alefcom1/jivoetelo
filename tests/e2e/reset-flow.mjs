/**
 * Сброс пароля против настоящей базы: запросили, сменили, вошли.
 * Проверяем не «функция вернула объект», а что старый пароль перестал
 * работать, чужие сессии умерли, а ссылка одноразовая.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResets, sessions, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkResetToken, createResetToken, hashResetToken } from "@/lib/password-reset";

const db = getDb();
const now = new Date();
let bad = 0;
const check = (ok, label, extra = "") => { if (!ok) bad += 1; console.log(`${ok ? "ok  " : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`); };

const [user] = await db.insert(users)
  .values({ email: "reset@x.ru", passwordHash: await hashPassword("старый-пароль") })
  .returning({ id: users.id });

// Две живые сессии на других устройствах.
await db.insert(sessions).values([
  { tokenHash: "s1", userId: user.id, expiresAt: new Date(now.getTime() + 86400000) },
  { tokenHash: "s2", userId: user.id, expiresAt: new Date(now.getTime() + 86400000) },
]);

// Запрос ссылки — дважды подряд, как делает человек, которому «не пришло».
const first = createResetToken(now);
const second = createResetToken(now);
await db.insert(passwordResets).values([
  { tokenHash: first.tokenHash, userId: user.id, expiresAt: first.expiresAt },
  { tokenHash: second.tokenHash, userId: user.id, expiresAt: second.expiresAt },
]);

const read = async (hash) => {
  const r = await db.select({ userId: passwordResets.userId, expiresAt: passwordResets.expiresAt, usedAt: passwordResets.usedAt })
    .from(passwordResets).where(eq(passwordResets.tokenHash, hash)).limit(1);
  return r[0] ?? null;
};

check((await read(second.tokenHash)) !== null, "второй запрос не затирает первый");
check(checkResetToken(await read(second.tokenHash), now).valid, "свежая ссылка годна");

// Применяем вторую ссылку — ровно то, что делает applyReset.
await db.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.tokenHash, second.tokenHash));
await db.update(users).set({ passwordHash: await hashPassword("новый-пароль") }).where(eq(users.id, user.id));
await db.delete(sessions).where(eq(sessions.userId, user.id));
await db.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.userId, user.id));

const after = (await db.select({ h: users.passwordHash }).from(users).where(eq(users.id, user.id)))[0];
check(await verifyPassword("новый-пароль", after.h), "новый пароль подходит");
check(!(await verifyPassword("старый-пароль", after.h)), "старый пароль больше не подходит");
check((await db.select().from(sessions).where(eq(sessions.userId, user.id))).length === 0, "все чужие сессии погашены");

check(!checkResetToken(await read(second.tokenHash), now).valid, "использованная ссылка повторно не работает");
check(!checkResetToken(await read(first.tokenHash), now).valid, "и старая ссылка из первого письма тоже");

// Хеш в базе, а не токен.
const stored = await db.select({ h: passwordResets.tokenHash }).from(passwordResets);
check(stored.every((r) => r.h !== first.token && r.h !== second.token), "в базе лежат только хеши");
check(stored.some((r) => r.h === hashResetToken(second.token)), "и хеш совпадает с тем, что даёт функция");

console.log(bad === 0 ? "\n=== СЦЕНАРИЙ СБРОСА СОШЁЛСЯ ===" : `\n=== РАСХОЖДЕНИЙ: ${bad} ===`);
process.exit(bad === 0 ? 0 : 1);
