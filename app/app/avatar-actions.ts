"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ALLOWED_PHOTO_TYPES, deletePhoto, savePhoto } from "@/lib/storage";

/**
 * Фото профиля: поставить, заменить, убрать.
 *
 * Хранится тем же кодом, что и снимки еды (lib/storage.ts), и это не
 * экономия ради экономии. Там уже решены три вещи, которые пришлось бы
 * решать заново: путь на диске, проверка формата и — главное —
 * принадлежность файла, которая видна прямо из ключа. Отдельное хранилище
 * для одной картинки означало бы вторую реализацию проверки доступа, а
 * ошибиться в ней стоит чужого фото.
 *
 * Предел вдвое меньше, чем у еды. Снимок тарелки должен быть подробным —
 * его разбирает модель; аватар показывается кружком в сорок пикселей, и
 * восьмимегабайтный файл здесь означает только медленную страницу.
 *
 * Число не экспортируется: файл помечен «use server», и Next разрешает
 * вывозить отсюда только асинхронные функции — всё остальное превращается в
 * серверное действие с тем же именем. Панель настроек называет «4 МБ»
 * текстом, и расхождение поймает глаз, а не тест: числа рядом.
 */
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export type AvatarState = { status: "idle" | "ok" } | { status: "failed"; message: string };

export async function saveAvatar(_prev: AvatarState, formData: FormData): Promise<AvatarState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "failed", message: "Выберите файл." };
  }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return { status: "failed", message: "Подойдёт JPEG, PNG, WebP или GIF." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { status: "failed", message: "Файл больше 4 МБ — возьмите поменьше." };
  }

  const data = Buffer.from(await file.arrayBuffer());
  const key = await savePhoto(user.id, data, file.type);
  const previous = user.avatarKey;

  await getDb().update(users).set({ avatarKey: key }).where(eq(users.id, user.id));
  // Старый файл удаляем после того, как новый записан в базу, а не до: упади
  // запись между удалением и обновлением — человек остался бы без фото и без
  // возможности понять, куда оно делось.
  if (previous) await deletePhoto(previous).catch(() => {});

  revalidatePath("/app", "layout");
  return { status: "ok" };
}

export async function removeAvatar(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.avatarKey) return;

  await getDb().update(users).set({ avatarKey: null }).where(eq(users.id, user.id));
  await deletePhoto(user.avatarKey).catch(() => {});
  revalidatePath("/app", "layout");
}
