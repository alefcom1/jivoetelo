// Доступ к базе для каталожных снимков. Отделено от `catalog-photos.ts`,
// чтобы подпись к снимку можно было покрыть юнит-тестами: этот модуль тянет
// `next/cache` и алиас `@/db`, которые в node:test не разрешаются.

import { and, desc, eq, inArray, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { catalogPhotos, mealItems, meals, users, userConsents } from "@/db/schema";
import { getDb } from "@/db";
import { photoMimeType, readPhoto } from "./storage.ts";
import type { CatalogPhoto, PhotoStatus } from "./catalog-photos.ts";

/**
 * Фотографии продукта для публичной страницы.
 *
 * `limit` небольшой сознательно: галерея из двадцати чужих тарелок не
 * помогает ответить на вопрос про калорийность, а страницу утяжеляет.
 */
export async function approvedPhotosFor(productSlug: string, limit = 3): Promise<CatalogPhoto[]> {
  // Снимки — дополнение к ответу, а не сам ответ: калорийность, порции и
  // пересчёт лежат в репозитории и считаются без базы. Поэтому недоступная
  // база означает страницу без фотографий, а не пятисотую ошибку.
  //
  // Это не гипотетическая осторожность: страницы каталога собираются
  // статически, и во время сборки базы нет вовсе.
  try {
    return await queryApprovedPhotos(productSlug, limit);
  } catch {
    return [];
  }
}

async function queryApprovedPhotos(productSlug: string, limit: number): Promise<CatalogPhoto[]> {
  const db = getDb();

  // Согласие проверяется соединением, а не отдельным запросом: иначе между
  // «выбрали снимки» и «проверили согласия» остаётся щель, в которую
  // помещается отозванное согласие.
  const rows = await db
    .select({
      id: catalogPhotos.id,
      photoKey: catalogPhotos.photoKey,
      caption: catalogPhotos.caption,
      createdAt: catalogPhotos.createdAt,
    })
    .from(catalogPhotos)
    .innerJoin(
      userConsents,
      and(
        eq(userConsents.userId, catalogPhotos.userId),
        eq(userConsents.kind, "photo_publication"),
        isNull(userConsents.withdrawnAt),
      ),
    )
    .where(and(eq(catalogPhotos.productSlug, productSlug), eq(catalogPhotos.status, "approved")))
    .orderBy(desc(catalogPhotos.createdAt))
    .limit(limit);

  return rows;
}

/**
 * Ключ файла для публичной раздачи — и сразу вместе с проверкой права его
 * отдавать. Разделять «найти» и «проверить» здесь нельзя: это единственный
 * маршрут снимков без авторизации, и забытая проверка означает чужое фото на
 * публичной странице.
 *
 * `null` — и когда снимка нет, и когда его нельзя показывать. Наружу разница
 * не выходит: маршрут в обоих случаях отвечает 404, иначе перебор
 * идентификаторов рассказал бы, какие снимки существуют.
 */
export async function photoForDelivery(id: number): Promise<{ data: Buffer; mime: string } | null> {
  const rows = await getDb()
    .select({ photoKey: catalogPhotos.photoKey })
    .from(catalogPhotos)
    .innerJoin(
      userConsents,
      and(
        eq(userConsents.userId, catalogPhotos.userId),
        eq(userConsents.kind, "photo_publication"),
        isNull(userConsents.withdrawnAt),
      ),
    )
    .where(and(eq(catalogPhotos.id, id), eq(catalogPhotos.status, "approved")))
    .limit(1);

  const key = rows[0]?.photoKey;
  if (!key) return null;

  const data = await readPhoto(key);
  return data ? { data, mime: photoMimeType(key) } : null;
}

/**
 * Принять снимок на модерацию.
 *
 * Согласие проверяет вызывающий код до обращения сюда: подпись о согласии
 * ставится в том же действии, где человек выбирает снимок, и версия
 * документов фиксируется вместе со строкой.
 */
export async function submitPhoto(input: {
  userId: number;
  productSlug: string;
  photoKey: string;
  caption: string;
  consentVersion: string;
}): Promise<number> {
  const inserted = await getDb()
    .insert(catalogPhotos)
    .values({ ...input, status: "pending" })
    .returning({ id: catalogPhotos.id });
  return inserted[0].id;
}

/**
 * Решение модератора. Отклонение с причиной — чтобы человеку было что ответить.
 *
 * Страница продукта статическая и пересобирается раз в сутки. Без явного
 * сброса одобренный снимок ждал бы публикации до суток — а модерация и так
 * ручная и небыстрая, складывать одну задержку в другую незачем. Отклонение
 * сбрасывает кеш по той же причине, но обратной: снятый снимок должен
 * исчезнуть со страницы сразу, а не когда-нибудь.
 */
export async function reviewPhoto(
  id: number,
  status: Exclude<PhotoStatus, "pending">,
  reason?: string,
  /** Внутренняя заметка модератора. Автор её не увидит — она не для него. */
  moderatorNote?: string | null,
) {
  const rows = await getDb()
    .update(catalogPhotos)
    .set({
      status,
      rejectionReason: reason ?? null,
      ...(moderatorNote === undefined ? {} : { moderatorNote }),
      reviewedAt: new Date(),
    })
    .where(eq(catalogPhotos.id, id))
    .returning({ productSlug: catalogPhotos.productSlug });

  const slug = rows[0]?.productSlug;
  if (slug) revalidatePath(`/produkty/${slug}`);
}

/**
 * Написать автору о решении по снимку.
 *
 * Отдельным шагом после `reviewPhoto`, а не внутри него: решение должно быть
 * записано, даже если Telegram и почта недоступны разом. Не дошедшее видно по
 * пустому `notified_at` — и его можно будет разослать повторно, не гадая, кому
 * уже написали.
 */
export async function notifyDecision(id: number, comment: string | null): Promise<boolean> {
  const rows = await getDb()
    .select({
      status: catalogPhotos.status,
      productSlug: catalogPhotos.productSlug,
      notifiedAt: catalogPhotos.notifiedAt,
      email: users.email,
      telegramUserId: users.telegramUserId,
    })
    .from(catalogPhotos)
    .innerJoin(users, eq(users.id, catalogPhotos.userId))
    .where(eq(catalogPhotos.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.status === "pending") return false;
  // Уже писали — второй раз не пишем. Повторный разбор очереди иначе слал бы
  // одно и то же сообщение.
  if (row.notifiedAt) return false;

  const { notifyPhotoDecision } = await import("./catalog-photo-notify.ts");
  const { findProduct } = await import("./products.ts");
  const sent = await notifyPhotoDecision(
    { email: row.email, telegramUserId: row.telegramUserId },
    {
      productTitle: findProduct(row.productSlug)?.name ?? row.productSlug,
      approved: row.status === "approved",
      comment,
    },
  );
  if (sent) {
    await getDb().update(catalogPhotos).set({ notifiedAt: new Date() }).where(eq(catalogPhotos.id, id));
  }
  return sent;
}

export type PendingPhoto = CatalogPhoto & {
  productSlug: string;
  /** Почта автора — модератору надо понимать, кому отвечать при отказе. */
  authorEmail: string | null;
  /** Согласие на публикацию действует прямо сейчас. */
  consentActive: boolean;
};

/**
 * Очередь модерации.
 *
 * Согласие здесь не фильтрует, а показывается флагом: снимок, у которого
 * согласие отозвано между отправкой и разбором, модератор должен увидеть и
 * отклонить осознанно, а не искать, куда он делся. Показывать такой кадр
 * на сайте всё равно нельзя — за это отвечает `approvedPhotosFor`.
 */
export async function pendingPhotos(limit = 50): Promise<PendingPhoto[]> {
  return getDb()
    .select({
      id: catalogPhotos.id,
      photoKey: catalogPhotos.photoKey,
      caption: catalogPhotos.caption,
      createdAt: catalogPhotos.createdAt,
      productSlug: catalogPhotos.productSlug,
      authorEmail: users.email,
      consentActive: sql<boolean>`exists (
        select 1 from ${userConsents}
        where ${userConsents.userId} = ${catalogPhotos.userId}
          and ${userConsents.kind} = 'photo_publication'
          and ${userConsents.withdrawnAt} is null
      )`,
    })
    .from(catalogPhotos)
    .innerJoin(users, eq(users.id, catalogPhotos.userId))
    .where(eq(catalogPhotos.status, "pending"))
    .orderBy(desc(catalogPhotos.createdAt))
    .limit(limit);
}

/**
 * Снимок для модератора — до одобрения его нельзя отдать публичным
 * маршрутом, а посмотреть надо: иначе модерация сводится к чтению подписи.
 */
export async function photoForReview(id: number): Promise<{ data: Buffer; mime: string } | null> {
  const rows = await getDb()
    .select({ photoKey: catalogPhotos.photoKey })
    .from(catalogPhotos)
    .where(eq(catalogPhotos.id, id))
    .limit(1);

  const key = rows[0]?.photoKey;
  if (!key) return null;
  const data = await readPhoto(key);
  return data ? { data, mime: photoMimeType(key) } : null;
}

/** Уже отправленные снимки этого человека — чтобы не предлагать отправить дважды. */
export async function submittedSlugsFor(userId: number): Promise<Set<string>> {
  const rows = await getDb()
    .select({ productSlug: catalogPhotos.productSlug, photoKey: catalogPhotos.photoKey })
    .from(catalogPhotos)
    .where(eq(catalogPhotos.userId, userId));
  return new Set(rows.map((row) => `${row.photoKey}::${row.productSlug}`));
}

/* ═══ Банк кандидатов ═══════════════════════════════════════════════════════

   Очередь модерации была пуста не из-за ошибки. Единственный путь в неё вёл
   из карточки приёма пищи: найти запись, выбрать продукт, поставить галочку
   согласия, отправить. Четыре шага ради того, чтобы отдать сервису свою
   фотографию, — и их не делал никто. Каталог остался без снимков, а именно
   снимки были тем, чего нет ни у одного конкурента в рунете.

   Теперь предлагает модератор: он видит снимки дневников как кандидатов,
   выбирает подходящий и предлагает автору опубликовать его на конкретной
   странице. Разница с прежним путём не в удобстве, а в том, кто начинает
   разговор.

   ## Почему согласие всё равно спрашивается

   Соблазн был обратный: собирать всё и публиковать по умолчанию, а несогласным
   дать выключатель. Так делать нельзя, и не по осторожности: 152-ФЗ, ст. 10.1
   ч. 8 — «молчание или бездействие субъекта персональных данных ни при каких
   обстоятельствах не может считаться согласием на обработку персональных
   данных, разрешённых субъектом персональных данных для распространения».
   Публикация снимка на открытой странице — это распространение, и опереться
   на невыключенный переключатель здесь нельзя.

   Практически это ничего не стоит. Абстрактную галочку «разрешаю публиковать
   мои фото» не ставит никто; на вопрос «вот этот ваш кадр творога хорошо
   показывает порцию, можно поставить его на страницу?» отвечают охотно,
   потому что он про конкретную фотографию и понятен целиком.

   ## Что делает выключатель в настройках

   Ровно то, что просили: запрещает **предлагать**. Снимки человека с
   `photo_offers_opt_out` не попадают даже в очередь кандидатов у модератора,
   и вопроса он не увидит никогда. */

/** Снимок дневника, который модератор ещё не предлагал. */
export type PhotoCandidate = {
  mealId: number;
  userId: number;
  photoKey: string;
  eatenOn: string;
  /** Названия позиций из записи — по ним модератор понимает, что на снимке. */
  items: string[];
};

/**
 * Снимки, которые ещё никому не предлагали.
 *
 * Отсеиваются три вида: у кого стоит запрет предлагать, что уже лежит в
 * `catalog_photos` в любом состоянии (включая отказ автора — второй раз с тем
 * же кадром приходить нельзя) и записи без фотографии.
 *
 * Свежие сверху: снимок недельной давности автор помнит, а полугодовой —
 * нет, и предложение про него выглядит как рытьё в чужом архиве.
 */
export async function photoCandidates(limit = 60): Promise<PhotoCandidate[]> {
  const db = getDb();
  const rows = await db
    .select({
      mealId: meals.id,
      userId: meals.userId,
      photoKey: meals.photoKey,
      eatenOn: meals.eatenOn,
    })
    .from(meals)
    .innerJoin(users, eq(users.id, meals.userId))
    .where(
      and(
        isNotNull(meals.photoKey),
        eq(users.photoOffersOptOut, false),
        notExists(
          db
            .select({ one: sql`1` })
            .from(catalogPhotos)
            .where(eq(catalogPhotos.photoKey, meals.photoKey)),
        ),
      ),
    )
    .orderBy(desc(meals.eatenOn), desc(meals.id))
    .limit(limit);

  if (rows.length === 0) return [];

  // Названия позиций — одним запросом на всю пачку, а не по записи: очередь
  // в шестьдесят кадров иначе даёт шестьдесят обращений к базе.
  const ids = rows.map((row) => row.mealId);
  const itemRows = await db
    .select({ mealId: mealItems.mealId, name: mealItems.name })
    .from(mealItems)
    .where(inArray(mealItems.mealId, ids));

  const byMeal = new Map<number, string[]>();
  for (const item of itemRows) {
    const list = byMeal.get(item.mealId) ?? [];
    if (list.length < 4) list.push(item.name);
    byMeal.set(item.mealId, list);
  }

  return rows.map((row) => ({
    mealId: row.mealId,
    userId: row.userId,
    photoKey: row.photoKey!,
    eatenOn: row.eatenOn,
    items: byMeal.get(row.mealId) ?? [],
  }));
}

/**
 * Предложить автору опубликовать снимок.
 *
 * `consentVersion` не ставится: согласия ещё нет, и записать сюда текущую
 * редакцию значило бы задним числом утверждать, что человек на неё
 * соглашался. Оно появится в `answerOffer`, вместе с ответом.
 */
export async function offerPhoto(input: {
  userId: number;
  productSlug: string;
  photoKey: string;
  caption: string;
  moderatorId: number;
}): Promise<number> {
  const inserted = await getDb()
    .insert(catalogPhotos)
    .values({
      userId: input.userId,
      productSlug: input.productSlug,
      photoKey: input.photoKey,
      caption: input.caption,
      status: "offered",
      offeredBy: input.moderatorId,
      offeredAt: new Date(),
    })
    .returning({ id: catalogPhotos.id });
  return inserted[0].id;
}

/** Предложения, ожидающие ответа этого человека. */
export async function offersFor(userId: number): Promise<Array<{ id: number; caption: string; productSlug: string }>> {
  return await getDb()
    .select({ id: catalogPhotos.id, caption: catalogPhotos.caption, productSlug: catalogPhotos.productSlug })
    .from(catalogPhotos)
    .where(and(eq(catalogPhotos.userId, userId), eq(catalogPhotos.status, "offered")))
    .orderBy(desc(catalogPhotos.offeredAt));
}

/**
 * Ответ автора на предложение.
 *
 * `userId` в условии — не перестраховка: идентификатор предложения приходит
 * из формы, и без него любой вошедший мог бы ответить за другого. Согласие и
 * смена состояния идут одной транзакцией: строка со статусом «согласовано»
 * без записи в `user_consents` не должна существовать даже секунду.
 */
export async function answerOffer(
  userId: number,
  offerId: number,
  agree: boolean,
  consentVersion: string,
): Promise<boolean> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: catalogPhotos.id })
      .from(catalogPhotos)
      .where(
        and(
          eq(catalogPhotos.id, offerId),
          eq(catalogPhotos.userId, userId),
          eq(catalogPhotos.status, "offered"),
        ),
      )
      .limit(1);
    if (rows.length === 0) return false;

    if (!agree) {
      // Отказ пишем в ту же строку и с пометкой для себя: кадр помечен
      // отвеченным, и очередь кандидатов не предложит его снова.
      await tx
        .update(catalogPhotos)
        .set({ status: "rejected", moderatorNote: "автор отказался", reviewedAt: new Date() })
        .where(eq(catalogPhotos.id, offerId));
      return true;
    }

    const existing = await tx
      .select({ id: userConsents.id })
      .from(userConsents)
      .where(and(eq(userConsents.userId, userId), eq(userConsents.kind, "photo_publication")))
      .limit(1);
    if (existing.length === 0) {
      await tx.insert(userConsents).values({
        userId,
        kind: "photo_publication",
        version: consentVersion,
        source: "web",
      });
    } else {
      await tx
        .update(userConsents)
        .set({ withdrawnAt: null, version: consentVersion, acceptedAt: new Date() })
        .where(eq(userConsents.id, existing[0].id));
    }

    // Не сразу в публикацию: модератор смотрел кадр в дневнике, но подпись и
    // привязку к продукту ставил без второго взгляда, а публикуется именно
    // эта пара. Второй взгляд стоит минуту, откат публикации — нет.
    await tx
      .update(catalogPhotos)
      .set({ status: "pending", consentVersion })
      .where(eq(catalogPhotos.id, offerId));
    return true;
  });
}

/** Переключатель «не предлагать публиковать мои фотографии». */
export async function setPhotoOffersOptOut(userId: number, optOut: boolean): Promise<void> {
  await getDb().update(users).set({ photoOffersOptOut: optOut }).where(eq(users.id, userId));
}

export async function photoOffersOptOut(userId: number): Promise<boolean> {
  const rows = await getDb()
    .select({ optOut: users.photoOffersOptOut })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.optOut ?? false;
}
