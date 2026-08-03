import { requireAdmin } from "@/lib/admin";
import { photoForReview } from "@/lib/catalog-photos-store";

/**
 * Снимок для модератора — до одобрения.
 *
 * Публичный маршрут такой кадр не отдаёт по построению: он требует
 * `status = 'approved'`. Но модерировать по одной подписи невозможно, поэтому
 * здесь тот же файл выдаётся тому, кто имеет право решать. Проверка админа
 * стоит первой строкой и до всякой работы с базой.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return new Response("Not found", { status: 404 });

  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });

  const photo = await photoForReview(id);
  if (!photo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      // Непроверенный кадр не должен осесть ни в каком общем кеше.
      "Cache-Control": "no-store",
    },
  });
}
