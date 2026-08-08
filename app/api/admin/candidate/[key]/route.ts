import { requireAdmin } from "@/lib/admin";
import { photoMimeType, readPhoto } from "@/lib/storage";

/**
 * Снимок дневника для очереди кандидатов.
 *
 * Отдельно от `/api/admin/photo/[id]`: там кадр берётся по строке каталога, а
 * здесь строки ещё нет — снимок лежит в дневнике и никому не предлагался.
 *
 * Ключ приходит из адреса, поэтому проверка администратора стоит первой
 * строкой, а сам ключ нормализуется: `readPhoto` работает с путём на диске, и
 * пускать в него «..» из адресной строки нельзя.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return new Response("Not found", { status: 404 });

  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  // Ключи снимков имеют вид «<userId>/<имя>.<ext>» — всё остальное отвергаем
  // целиком, не пытаясь чистить: полумеры в разборе путей и есть та щель, в
  // которую пролезает обход каталога.
  if (!/^\d+\/[A-Za-z0-9_-]+\.(jpe?g|png|webp|gif)$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  const data = await readPhoto(key);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": photoMimeType(key),
      // Кадр из чужого дневника не должен осесть ни в каком общем кеше.
      "Cache-Control": "no-store",
    },
  });
}
