import type { Metadata } from "next";
import { botUsername } from "@/lib/telegram";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Регистрация — Живое Тело",
  description:
    "Создайте аккаунт «Живого Тела»: дневник питания по фотографиям, персональная норма калорий и план, который подстраивается под ваш вес.",
  alternates: { canonical: "/register" },
};

/** См. app/login/page.tsx — обёртка нужна ради имени бота из окружения. */
/**
 * Страница рисуется на каждый запрос, а не спекается при сборке.
 *
 * Без этого Next пререндерил её один раз — в момент `npm run build`, когда
 * переменных окружения ещё нет: имя бота приезжало пустым, и кнопка «Войти
 * через Telegram» просто не появлялась, сколько ни правь `.env`. Ловушка
 * тихая: страница работает, ошибок нет, нет только кнопки.
 *
 * Цена — отказ от статической отдачи двух маленьких форм. Это дешевле, чем
 * пересобирать образ ради строки в окружении.
 */
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <RegisterForm botUsername={botUsername()} />;
}
