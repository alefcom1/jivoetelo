import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Тонкая абстракция хранилища фото: сейчас диск VPS, интерфейс позволяет
// позже переехать на S3-совместимое хранилище без переписывания кода.

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const ALLOWED_PHOTO_TYPES = Object.keys(EXT_BY_MIME);
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), "data", "uploads");
}

/** Ключи имеют вид `<userId>/<uuid>.<ext>` — принадлежность видна из ключа. */
export function photoBelongsTo(key: string, userId: number): boolean {
  return /^\d+\/[0-9a-f-]+\.[a-z]+$/.test(key) && key.startsWith(`${userId}/`);
}

export function photoMimeType(key: string): string {
  for (const [mime, ext] of Object.entries(EXT_BY_MIME)) {
    if (key.endsWith(`.${ext}`)) return mime;
  }
  return "application/octet-stream";
}

export async function savePhoto(userId: number, data: Buffer, mime: string): Promise<string> {
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error(`Unsupported photo type: ${mime}`);
  const key = `${userId}/${randomUUID()}.${ext}`;
  const filePath = path.join(uploadsDir(), key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
  return key;
}

export async function readPhoto(key: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(uploadsDir(), key));
  } catch {
    return null;
  }
}

/**
 * Отдаёт снимок только его владельцу — общая проверка для всех раздатчиков
 * фото (веб-сессия в app/api/photos, initData Telegram в app/api/tg/photo).
 * Чужой ключ и отсутствующий файл возвращают одно и то же null: снаружи оба
 * случая должны выглядеть как обычный 404, не подсказывающий, чем именно
 * запрос не подошёл.
 */
export async function readOwnedPhoto(userId: number, key: string): Promise<{ data: Buffer; mime: string } | null> {
  if (!photoBelongsTo(key, userId)) return null;
  const data = await readPhoto(key);
  if (!data) return null;
  return { data, mime: photoMimeType(key) };
}

export async function deletePhoto(key: string): Promise<void> {
  await rm(path.join(uploadsDir(), key), { force: true });
}
