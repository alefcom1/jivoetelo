import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPendingItem } from "@/lib/inbox";
import { AddMealFlow } from "./add-meal-flow";

export default async function AddMealPage({
  searchParams,
}: {
  searchParams: Promise<{ inbox?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Разбор снимка из фото-инбокса — тот же экран, что и обычное добавление,
  // только фото уже есть. Если снимок успели разобрать или отклонить в другой
  // вкладке, возвращаемся в инбокс, а не показываем пустую форму.
  const { inbox: inboxParam } = await searchParams;
  let inbox = null;
  if (inboxParam) {
    const id = Number(inboxParam);
    inbox = Number.isInteger(id) ? await getPendingItem(user.id, id) : null;
    if (!inbox) redirect("/app/inbox");
  }

  return <AddMealFlow showCalories={user.showCalories} simpleMode={user.simpleMode} inbox={inbox} />;
}
