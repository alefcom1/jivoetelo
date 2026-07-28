import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { setShowCalories } from "../meal-actions";
import { TelegramLink } from "./telegram-link";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await getDb()
    .select({ telegramUserId: users.telegramUserId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const linked = !!rows[0]?.telegramUserId;

  const toggle = setShowCalories.bind(null, !user.showCalories);

  return <main className="settings">
    <h1>Настройки</h1>
    <section className="settings-block">
      <p className="settings-label">Аккаунт</p>
      <p>{user.email}</p>
    </section>
    <section className="settings-block">
      <p className="settings-label">План</p>
      <p>Цель, рост, вес и активность можно поменять в любой момент — план пересчитается сразу.</p>
      <a className="black-button" href="/app/onboarding">Изменить план</a>
    </section>
    <section className="settings-block">
      <p className="settings-label">Telegram</p>
      <TelegramLink linked={linked} />
    </section>
    <section className="settings-block">
      <p className="settings-label">Видимость калорий</p>
      <p>
        {user.showCalories
          ? "Сейчас калории показываются. Можно скрыть их и опираться на белок, клетчатку и привычки."
          : "Калории скрыты — вы видите белок и клетчатку. Цифры можно вернуть в любой момент."}
      </p>
      <form action={toggle}>
        <button className="black-button" type="submit">{user.showCalories ? "Скрыть калории" : "Показывать калории"}</button>
      </form>
    </section>
  </main>;
}
