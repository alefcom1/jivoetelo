"use server";

// Отправка снимка в публичный каталог продуктов.
//
// Ключевое здесь — не форма, а то, что согласие и отправка происходят одним
// действием. Публикация снимка еды на открытой странице — отдельная цель
// обработки, не покрытая согласием на разбор: там снимок остаётся в дневнике
// человека, здесь его увидит кто угодно. Поэтому галочка обязательна, а
// редакция документов фиксируется вместе со строкой — через год надо уметь
// показать, на что именно человек соглашался.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { catalogPhotos, meals, userConsents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { buildCaption } from "@/lib/catalog-photos";
import { LEGAL_VERSION } from "@/lib/legal";
import { findProduct } from "@/lib/products";
import { photoBelongsTo } from "@/lib/storage";

export type ShareResult = { ok: true } | { ok: false; error: string };

export async function sharePhotoToCatalog(formData: FormData): Promise<ShareResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (formData.get("consent") !== "on") {
    return { ok: false, error: "Без согласия на публикацию снимок отправить нельзя." };
  }

  const mealId = Number(formData.get("mealId"));
  const slug = String(formData.get("productSlug") ?? "");
  const grams = Number(formData.get("grams"));

  const product = findProduct(slug);
  if (!product) return { ok: false, error: "Не нашли такой продукт в каталоге." };

  // Снимок берём из записи, а не из формы: иначе форма стала бы способом
  // опубликовать любой ключ, который отправитель сумеет подобрать.
  const db = getDb();
  const rows = await db
    .select({ photoKey: meals.photoKey })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, user.id)))
    .limit(1);

  const photoKey = rows[0]?.photoKey;
  if (!photoKey) return { ok: false, error: "У этой записи нет фотографии." };
  // Пояс поверх подтяжек: ключ уже пришёл из записи этого человека, но
  // проверка стоит одну строку, а цена ошибки — чужой снимок на витрине.
  if (!photoBelongsTo(photoKey, user.id)) return { ok: false, error: "Не получилось взять фотографию." };

  const alreadySent = await db
    .select({ id: catalogPhotos.id })
    .from(catalogPhotos)
    .where(and(eq(catalogPhotos.photoKey, photoKey), eq(catalogPhotos.productSlug, slug)))
    .limit(1);
  if (alreadySent.length > 0) return { ok: false, error: "Этот снимок уже отправлен на проверку." };

  // Согласие и отправка — одним действием и одной транзакцией: строка
  // каталога без действующего согласия не должна существовать даже секунду.
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: userConsents.id })
      .from(userConsents)
      .where(
        and(
          eq(userConsents.userId, user.id),
          eq(userConsents.kind, "photo_publication"),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await tx.insert(userConsents).values({
        userId: user.id,
        kind: "photo_publication",
        version: LEGAL_VERSION,
        source: "web",
      });
    } else {
      // Повторная отправка после отзыва — согласие возвращается, а редакция
      // документов обновляется на актуальную.
      await tx
        .update(userConsents)
        .set({ withdrawnAt: null, version: LEGAL_VERSION, acceptedAt: new Date() })
        .where(eq(userConsents.id, existing[0].id));
    }

    await tx.insert(catalogPhotos).values({
      userId: user.id,
      productSlug: slug,
      photoKey,
      caption: buildCaption(product.name, Number.isFinite(grams) && grams > 0 ? grams : product.portionG),
      status: "pending",
      consentVersion: LEGAL_VERSION,
    });
  });

  revalidatePath(`/app/meals/${mealId}`);
  return { ok: true };
}

/**
 * Отзыв согласия из настроек.
 *
 * Снимки не удаляются, а перестают показываться: `approvedPhotosFor`
 * проверяет согласие соединением, поэтому отзыв закрывает и уже
 * опубликованное. Удалить сами файлы человек может, удалив аккаунт или сами
 * записи дневника, — здесь речь именно о публикации.
 */
export async function withdrawPhotoConsent(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const slugs = await db
    .select({ productSlug: catalogPhotos.productSlug })
    .from(catalogPhotos)
    .where(eq(catalogPhotos.userId, user.id));

  await db
    .update(userConsents)
    .set({ withdrawnAt: new Date() })
    .where(
      and(
        eq(userConsents.userId, user.id),
        eq(userConsents.kind, "photo_publication"),
      ),
    );

  // Страницы статические — без сброса снимок висел бы до суток после отзыва.
  for (const slug of new Set(slugs.map((row) => row.productSlug))) {
    revalidatePath(`/produkty/${slug}`);
  }
  revalidatePath("/app/settings");
}
