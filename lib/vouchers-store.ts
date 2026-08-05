/**
 * Ваучеры: база. Правила и разбор кода — в lib/vouchers.ts.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users, vouchers } from "@/db/schema";
import { extendAccess } from "./paid.ts";
import { checkVoucher, makeVoucherCode, normalizeCode, UNKNOWN_CODE_MESSAGE } from "./vouchers.ts";

export type IssueInput = {
  days: number;
  /** Кто выдаёт. null — начисление за приглашение, без человека. */
  issuedBy: number | null;
  /** Кому предназначен, если известно заранее. */
  issuedTo?: number | null;
  note?: string | null;
  expiresAt?: Date | null;
};

export type IssuedVoucher = { id: number; code: string; days: number };

/**
 * Выдать ваучер.
 *
 * Столкновение кодов маловероятно (31^8), но уникальный индекс на
 * «маловероятно» не полагается: одна ошибка вставки — и админ видит сломанную
 * кнопку вместо кода.
 */
export async function issueVoucher(input: IssueInput): Promise<IssuedVoucher> {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeVoucherCode();
    try {
      const rows = await db
        .insert(vouchers)
        .values({
          code,
          days: input.days,
          issuedBy: input.issuedBy,
          issuedTo: input.issuedTo ?? null,
          note: input.note ?? null,
          expiresAt: input.expiresAt ?? null,
        })
        .returning({ id: vouchers.id, code: vouchers.code, days: vouchers.days });
      if (rows[0]) return rows[0];
    } catch {
      // Столкновение по уникальному индексу — пробуем другой код.
    }
  }
  throw new Error("Не удалось выдать ваучер");
}

/** Выдать пачку — для раздачи блогеру или на мероприятии. */
export async function issueBatch(count: number, input: IssueInput): Promise<IssuedVoucher[]> {
  const out: IssuedVoucher[] = [];
  for (let i = 0; i < count; i += 1) out.push(await issueVoucher(input));
  return out;
}

export type RedeemResult =
  | { ok: true; days: number; accessUntil: Date }
  | { ok: false; message: string };

/**
 * Погасить ваучер.
 *
 * Погашение и продление доступа идут одним запросом каждое, но порядок важен:
 * сначала помечаем код использованным — с условием «ещё не использован» прямо
 * в WHERE, — и только потом продлеваем доступ. При гонке двух вкладок пометку
 * получит одна, и доступ продлится один раз. Обратный порядок дал бы два
 * продления по одному коду.
 */
export async function redeemVoucher(userId: number, raw: string, now = new Date()): Promise<RedeemResult> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, message: UNKNOWN_CODE_MESSAGE };

  const db = getDb();
  const found = await db
    .select({ id: vouchers.id, days: vouchers.days, usedBy: vouchers.usedBy, expiresAt: vouchers.expiresAt })
    .from(vouchers)
    .where(eq(vouchers.code, code))
    .limit(1);
  const voucher = found[0];
  if (!voucher) return { ok: false, message: UNKNOWN_CODE_MESSAGE };

  const verdict = checkVoucher({ usedBy: voucher.usedBy, expiresAt: voucher.expiresAt }, now);
  if (!verdict.ok) return { ok: false, message: verdict.message };

  const claimed = await db
    .update(vouchers)
    .set({ usedBy: userId, usedAt: now })
    .where(and(eq(vouchers.id, voucher.id), isNull(vouchers.usedBy)))
    .returning({ id: vouchers.id });
  if (claimed.length === 0) {
    // Между чтением и записью код успели погасить — в соседней вкладке или
    // тем, с кем им поделились.
    return { ok: false, message: "Этот код уже использован." };
  }

  const current = await db
    .select({ accessUntil: users.accessUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const accessUntil = extendAccess(current[0]?.accessUntil ?? null, voucher.days, now);
  await db.update(users).set({ accessUntil }).where(eq(users.id, userId));

  return { ok: true, days: voucher.days, accessUntil };
}

/**
 * Продлить доступ напрямую — оплатой.
 *
 * Отдельно от погашения ваучера: там продление это следствие успешной
 * пометки кода, здесь — самостоятельное действие. Общая у них только
 * `extendAccess`, и она чистая.
 */
export async function grantAccessDays(userId: number, days: number, now = new Date()): Promise<Date> {
  const db = getDb();
  const current = await db
    .select({ accessUntil: users.accessUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const accessUntil = extendAccess(current[0]?.accessUntil ?? null, days, now);
  await db.update(users).set({ accessUntil }).where(eq(users.id, userId));
  return accessUntil;
}

export type VoucherRow = {
  id: number;
  code: string;
  days: number;
  note: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  usedAt: Date | null;
  usedByEmail: string | null;
};

/** Журнал выдачи: свежие сверху. Ваучер — это деньги, и след нужен всегда. */
export async function listVouchers(limit = 100): Promise<VoucherRow[]> {
  return getDb()
    .select({
      id: vouchers.id,
      code: vouchers.code,
      days: vouchers.days,
      note: vouchers.note,
      createdAt: vouchers.createdAt,
      expiresAt: vouchers.expiresAt,
      usedAt: vouchers.usedAt,
      usedByEmail: users.email,
    })
    .from(vouchers)
    .leftJoin(users, eq(users.id, vouchers.usedBy))
    .orderBy(desc(vouchers.createdAt))
    .limit(limit);
}

/** Сводка по ваучерам для обзора: сколько выдано и сколько погашено. */
export async function voucherSummary(): Promise<{ issued: number; used: number }> {
  const rows = await getDb()
    .select({
      issued: sql<number>`count(*)::int`,
      used: sql<number>`count(${vouchers.usedAt})::int`,
    })
    .from(vouchers);
  return { issued: Number(rows[0]?.issued ?? 0), used: Number(rows[0]?.used ?? 0) };
}

/** Непогашенные ваучеры человека — то, что начислено ему за приглашения. */
export async function myVouchers(userId: number): Promise<Array<{ code: string; days: number }>> {
  return getDb()
    .select({ code: vouchers.code, days: vouchers.days })
    .from(vouchers)
    .where(and(eq(vouchers.issuedTo, userId), isNull(vouchers.usedAt)))
    .orderBy(desc(vouchers.createdAt));
}
