import type { Metadata } from "next";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import "./plan.css";
import PlanFlow from "./plan-flow";

export const metadata: Metadata = {
  title: "Стартовый план питания: коридор, а не обещанная дата — Живое Тело",
  description:
    "Пошаговый расчёт нормы энергии, белка и веса с честным коридором значений. Если формула переоценит ваш расход, мы прямо скажем, где план остановится, — вместо обещанной даты и цифры. Всё считается в браузере, ничего не сохраняется.",
  alternates: { canonical: "/raschet/plan" },
};

export default function PlanPage() {
  return <article className="raschet-page">
    <p className="kicker">Расчёт плана <i /></p>
    <h1>Стартовый коридор, а не обещанная цифра</h1>
    <p className="raschet-lead">
      Несколько вопросов — сначала о вашем текущем состоянии, потом о теле — а на выходе не одна цифра вроде
      «−14 кг за 98 дней», а честный коридор: сколько есть, что получится по этому плану и где он остановится,
      если формула ошиблась.
    </p>
    <p className="plan-privacy-note">
      Всё считается прямо в вашем браузере. Мы ничего не отправляем на сервер и нигде не сохраняем.
    </p>
    <p className="field-note">{NOT_MEDICAL_DISCLAIMER}</p>

    {/* Год берём здесь и передаём вниз: страница статическая, и если считать
        его на клиенте, разметка после гидратации разойдётся с HTML (тот же
        приём, что в app/raschet/energiya/page.tsx). */}
    <PlanFlow currentYear={new Date().getFullYear()} />
  </article>;
}
