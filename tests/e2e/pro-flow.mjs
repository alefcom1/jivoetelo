/**
 * Весь сценарий Про против настоящей базы: пригласил → согласился →
 * посмотрел → отозвал. Проверяем не «функция вернула объект», а что
 * доступ действительно открывается и действительно закрывается.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { specialists, users, meals } from "@/db/schema";
import { acceptInvite, findInvite, issueInvite, listAccessLog, listClients, listSpecialistsForClient, revokeLink, updateScopes } from "@/lib/pro/store";
import { withClientScope, getLink } from "@/lib/pro/guard";
import { checkInvite, normalizeInviteCode } from "@/lib/pro/invite";
import { grantedScopes } from "@/lib/pro/access";

const db = getDb();
const now = new Date();
let bad = 0;
const check = (ok, label, extra = "") => { if (!ok) bad += 1; console.log(`${ok ? "ok  " : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`); };

// Три аккаунта: специалист, клиент и посторонний.
const [spec, client, stranger] = await db.insert(users)
  .values([{ email: "spec@x.ru", passwordHash: "h" }, { email: "client@x.ru", passwordHash: "h" }, { email: "other@x.ru", passwordHash: "h" }])
  .returning({ id: users.id });
await db.insert(meals).values({ userId: client.id, eatenOn: "2026-07-30", eatenTime: "13:00", mealType: "lunch" });

const read = async () => "ДАННЫЕ";

// 1. Неподтверждённый специалист не проходит даже с приглашением.
await db.insert(specialists).values({ userId: spec.id, displayName: "Мария Н.", status: "pending" });
const inv0 = await issueInvite(spec.id, now, (n) => new Uint8Array(randomBytes(n)));
await acceptInvite({ code: inv0.code, clientUserId: client.id, specialistUserId: spec.id, scopes: ["summary", "diary"], clientName: "Аня", now });
let r = await withClientScope(spec.id, client.id, "summary", read);
check(!r.ok && r.reason === "specialist_not_approved", "неподтверждённый специалист не видит ничего", r.ok ? "открылось!" : r.reason);

// 2. После подтверждения — открывается разрешённое.
await db.update(specialists).set({ status: "approved" }).where(eq(specialists.userId, spec.id));
r = await withClientScope(spec.id, client.id, "summary", read);
check(r.ok, "подтверждённый видит разрешённые итоги");
r = await withClientScope(spec.id, client.id, "diary", read);
check(r.ok, "и разрешённый дневник");

// 3. Неразрешённый объём закрыт.
r = await withClientScope(spec.id, client.id, "weight", read);
check(!r.ok && r.reason === "scope_not_granted", "неразрешённый вес закрыт", r.ok ? "открылся!" : r.reason);

// 4. Посторонний не видит ничего.
r = await withClientScope(stranger.id, client.id, "summary", read);
check(!r.ok, "посторонний не видит ничего", r.ok ? "ОТКРЫЛОСЬ!" : r.reason);

// 5. Код одноразовый.
const again = checkInvite(await findInvite(inv0.code), client.id, now);
check(!again.valid && again.reason === "used", "код погашен после использования");

// 6. Нормализация введённого кода.
check(normalizeInviteCode(`${inv0.code.slice(0,4)}-${inv0.code.slice(4)}`.toLowerCase()) === inv0.code, "код узнаётся в том виде, в каком его диктуют");

// 7. Журнал видит клиент.
const log = await listAccessLog(client.id);
// В журнал идут только состоявшиеся открытия: он отвечает на вопрос «кто
// видел мои данные», а не «кто пытался». Отказов тут быть не должно.
check(log.length === 2, "состоявшиеся открытия попали в журнал", `записей: ${log.length}`);
check(log.every((e) => e.specialistName === "Мария Н."), "в журнале имя специалиста");

// 8. Список клиентов у специалиста.
const clients = await listClients(spec.id);
check(clients.length === 1 && clients[0].clientName === "Аня", "клиент в списке под своим именем");
check(clients[0].lastMealOn === "2026-07-30", "видна дата последней записи", String(clients[0].lastMealOn));

// 9. Клиент сузил объём.
const links = await listSpecialistsForClient(client.id);
await updateScopes(links[0].id, client.id, ["summary"], now);
r = await withClientScope(spec.id, client.id, "diary", read);
check(!r.ok && r.reason === "scope_not_granted", "снятая галочка закрывает дневник немедленно");

// 10. Чужой не может изменить связь.
await updateScopes(links[0].id, stranger.id, ["summary", "diary", "weight"], now);
r = await withClientScope(spec.id, client.id, "diary", read);
check(!r.ok, "посторонний не расширил чужой доступ", r.ok ? "РАСШИРИЛ!" : r.reason);

// 11. Отзыв.
await revokeLink(links[0].id, client.id, now);
r = await withClientScope(spec.id, client.id, "summary", read);
check(!r.ok && r.reason === "revoked", "после отзыва закрыто всё");
check(grantedScopes(await getLink(spec.id, client.id), now).length === 0, "разрешённых объёмов не осталось");
check((await listClients(spec.id)).length === 0, "клиент исчез из списка специалиста");
check((await listSpecialistsForClient(client.id)).length === 1, "но остался в истории клиента");

// 12. Повторное приглашение оживляет связь.
const inv2 = await issueInvite(spec.id, now, (n) => new Uint8Array(randomBytes(n)));
await acceptInvite({ code: inv2.code, clientUserId: client.id, specialistUserId: spec.id, scopes: ["weight"], clientName: "Аня", now });
r = await withClientScope(spec.id, client.id, "weight", read);
check(r.ok, "повторное согласие открывает заново");
check((await listSpecialistsForClient(client.id)).length === 1, "и не плодит вторую строку на паре");

console.log(bad === 0 ? "\n=== ВЕСЬ СЦЕНАРИЙ СОШЁЛСЯ ===" : `\n=== РАСХОЖДЕНИЙ: ${bad} ===`);
process.exit(bad === 0 ? 0 : 1);
