"use server";

/**
 * Предложения опубликовать снимок и запрет на них.
 *
 * ## Почему согласие спрашивается, а не подразумевается
 *
 * Простой путь выглядел так: собирать все снимки, публиковать по умолчанию, а
 * несогласным дать выключатель. Так делать нельзя — и не из осторожности.
 * 152-ФЗ, ст. 10.1 ч. 8: «молчание или бездействие субъекта персональных
 * данных ни при каких обстоятельствах не может считаться согласием на
 * обработку персональных данных, разрешённых субъектом персональных данных
 * для распространения». Снимок на открытой странице каталога — это
 * распространение, и опереться на невыключенный переключатель здесь нечем.
 *
 * Практически это ничего не стоит. Абстрактную галочку «разрешаю публиковать
 * мои фотографии» не ставил никто — очередь модерации стояла пустой. На
 * вопрос «вот этот ваш кадр творога хорошо показывает порцию, можно поставить
 * его на страницу продукта?» отвечают охотно: он про одну конкретную
 * фотографию, и понятен целиком.
 *
 * Выключатель при этом есть и делает ровно то, что от него ждут: запрещает
 * **предлагать**. Снимки человека, который его поставил, не попадают даже в
 * очередь кандидатов у модератора.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { answerOffer, setPhotoOffersOptOut } from "@/lib/catalog-photos-store";
import { LEGAL_VERSION } from "@/lib/legal";

export async function answerPhotoOffer(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = Number(formData.get("offerId"));
  const agree = formData.get("answer") === "yes";
  if (!Number.isInteger(id) || id <= 0) return;

  // `answerOffer` сверяет владельца сам: идентификатор приходит из формы, и
  // без проверки любой вошедший отвечал бы за другого.
  await answerOffer(user.id, id, agree, LEGAL_VERSION);
  revalidatePath("/app/settings");
}

export async function setPhotoOffers(optOut: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setPhotoOffersOptOut(user.id, optOut);
  revalidatePath("/app/settings");
}
