// Доступ к базе для каталожных снимков. Отделено от `catalog-photos.ts`,
// чтобы подпись к снимку можно было покрыть юнит-тестами: этот модуль тянет
// `next/cache` и алиас `@/db`, которые в node:test не разрешаются.

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { catalogPhotos, userConsents } from "@/db/schema";
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
export async function reviewPhoto(id: number, status: Exclude<PhotoStatus, "pending">, reason?: string) {
  const rows = await getDb()
    .update(catalogPhotos)
    .set({ status, rejectionReason: reason ?? null, reviewedAt: new Date() })
    .where(eq(catalogPhotos.id, id))
    .returning({ productSlug: catalogPhotos.productSlug });

  const slug = rows[0]?.productSlug;
  if (slug) revalidatePath(`/produkty/${slug}`);
}
