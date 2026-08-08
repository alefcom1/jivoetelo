import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSpecialistProfile } from "@/lib/pro/guard";
import { getDb } from "@/db";
import { specialists } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SpecialistSignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Открыть кабинет специалиста — Живое Тело Pro",
  description:
    "Кабинет нутрициолога открывается сразу и бесплатно: имя, специализация — и можно приглашать клиентов. Проверка профиля идёт после, а не до.",
  alternates: { canonical: "/pro/registraciya" },
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Заведение кабинета.
 *
 * Три состояния, и каждое отвечает на свой вопрос. Не вошёл — «сначала
 * аккаунт, и вот почему». Профиля нет — форма. Профиль есть — правка, и
 * ссылка в кабинет: человек, попавший сюда по старой ссылке, не должен
 * гадать, куда делся его кабинет.
 */
export default async function ProSignupPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <article className="pro-page pro-doc">
        <section className="pro-hero">
          <p className="kicker">Живое Тело Pro <i /></p>
          <h1>Сначала<br /><em>аккаунт.</em></h1>
          <p className="pro-lead">
            Кабинет специалиста живёт в обычном аккаунте «Живого Тела» — отдельного входа нет.
            Так проще и вам: свой дневник и кабинет открываются одним и тем же паролем.
          </p>
          <div className="pro-hero-actions">
            <Link className="black-button" href="/register">Завести аккаунт <b>↗</b></Link>
            <Link className="pro-textlink" href="/login">Уже есть — войти →</Link>
          </div>
        </section>
        <section className="pro-doc-body">
          <p className="pro-doc-note">
            После входа вернитесь на эту страницу — кабинет открывается одной формой из четырёх
            полей, и обязательное в ней одно.
          </p>
        </section>
      </article>
    );
  }

  const profile = await getSpecialistProfile(user.id);
  const blocked = profile?.status === "rejected" || profile?.status === "suspended";

  // Полные поля профиля нужны только для предзаполнения формы правки, и
  // тянутся отдельно: `getSpecialistProfile` отдаёт то, что нужно проходу к
  // данным, и раздувать его ради одной страницы незачем.
  const full = profile
    ? (await getDb()
        .select({
          displayName: specialists.displayName,
          specialization: specialists.specialization,
          city: specialists.city,
          about: specialists.about,
        })
        .from(specialists)
        .where(eq(specialists.userId, user.id))
        .limit(1))[0] ?? null
    : null;

  return (
    <article className="pro-page pro-doc">
      <section className="pro-hero">
        <p className="kicker">Живое Тело Pro <i /></p>
        <h1>{profile ? <>Профиль<br /><em>специалиста.</em></> : <>Открыть<br /><em>кабинет.</em></>}</h1>
        <p className="pro-lead">
          {profile
            ? "Это то, что видит клиент, когда решает, открыть ли вам свои записи. Имя можно поправить в любой момент."
            : "Кабинет бесплатный и открывается сразу — ждать нашего ответа не нужно. Четыре поля, обязательное одно."}
        </p>
      </section>

      <section className="pro-doc-body">
        {blocked
          ? <p className="form-error">
              Доступ к разделу закрыт. Если это ошибка, ответьте на наше письмо — разберёмся.
            </p>
          : <>
              {/* Главное, что человек должен понять до заполнения: кабинет
                  открывается сразу не потому, что нам всё равно, а потому что
                  сам по себе он ничего не открывает. */}
              <p className="pro-doc-note">
                Кабинет открывается без проверки, и это осознанно: сам по себе он не показывает
                ничьих данных. Он позволяет выдать клиенту код — а что именно откроется, решает
                клиент, по каждому разделу отдельно и с отзывом в один клик.
              </p>
              <p>
                Проверку мы делаем после: смотрим профиль руками и ставим рядом с именем отметку
                «проверен сервисом». До неё клиенту честно написано, что имя вы указали себе сами.
              </p>

              <SpecialistSignupForm profile={full} />

              {profile && <p className="pro-more">
                <Link href="/pro/clients">← Вернуться в кабинет</Link>
              </p>}
            </>}
      </section>
    </article>
  );
}
