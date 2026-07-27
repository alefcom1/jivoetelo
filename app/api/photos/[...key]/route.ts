import { getCurrentUser } from "@/lib/auth";
import { photoBelongsTo, photoMimeType, readPhoto } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { key } = await params;
  const keyString = key.join("/");
  // Фото приватные: отдаём только владельцу, ключ проверяется по формату.
  if (!photoBelongsTo(keyString, user.id)) return new Response("Not found", { status: 404 });

  const data = await readPhoto(keyString);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": photoMimeType(keyString),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
