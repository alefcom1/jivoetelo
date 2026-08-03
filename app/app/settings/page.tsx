import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { userConsents, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { CONSENT_LABELS, isConsentKind } from "@/lib/legal";
import { PhotoConsent } from "./photo-consent";
import { getBotPreferences } from "@/lib/bot/store";
import { DEFAULT_DIGEST_HOUR } from "@/lib/reminders";
import { setShowCalories } from "../meal-actions";
import { CameraSettings } from "../../camera-settings";
import { BotReminders } from "./bot-reminders";
import { DangerZone } from "./danger-zone";
import { TelegramLink } from "./telegram-link";
import { UsagePanel } from "./usage-panel";

const consentDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const rows = await db
    .select({ telegramUserId: users.telegramUserId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const linked = !!rows[0]?.telegramUserId;

  const preferences = linked ? await getBotPreferences(user.id) : null;

  const consents = await db
    .select({
      kind: userConsents.kind,
      version: userConsents.version,
      acceptedAt: userConsents.acceptedAt,
      withdrawnAt: userConsents.withdrawnAt,
    })
    .from(userConsents)
    .where(eq(userConsents.userId, user.id))
    .orderBy(asc(userConsents.acceptedAt));

  // Согласие на публикацию снимков — единственное, которое отзывается само
  // по себе: без данных о питании дневник не работает, а без фотографий в
  // каталоге работает прекрасно.
  const photoConsent = consents.find((consent) => consent.kind === "photo_publication" && !consent.withdrawnAt);

  const toggle = setShowCalories.bind(null, !user.showCalories);

  return <main className="settings">
    <h1>Настройки</h1>
    <section className="settings-block">
      <p className="settings-label">Аккаунт</p>
      <p>{user.email ?? "Вход через Telegram — почта не указана"}</p>
      <p className="field-note">Тариф: бесплатный — доступны все возможности сервиса.</p>
    </section>
    <section className="settings-block">
      <p className="settings-label">Распознавание сегодня</p>
      <UsagePanel userId={user.id} plan={user.plan} />
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
    {linked &&
      <section className="settings-block">
        <p className="settings-label">Напоминания в боте</p>
        <BotReminders
          remindersEnabled={preferences?.remindersEnabled ?? true}
          digestHour={preferences?.digestHour ?? DEFAULT_DIGEST_HOUR}
          snoozedUntil={preferences?.snoozedUntil ?? null}
        />
      </section>}
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
    <section className="settings-block">
      <p className="settings-label">Камера</p>
      <p>Настройки этого устройства: на телефоне и на ноутбуке они свои.</p>
      <CameraSettings />
    </section>
    <section className="settings-block">
      <p className="settings-label">Ваши данные</p>
      <p>Выгрузка содержит всё, что сервис о вас знает: приёмы пищи и их состав, вес, план, согласия и служебные записи. Один файл, читаемый и человеком, и программой.</p>
      {/* Обычная ссылка, а не форма: браузер должен получить файл, а не
          перерисовать страницу. download подсказывает имя файла. */}
      <a className="black-button" href="/api/account/export" download>Скачать мои данные</a>
    </section>
    <section className="settings-block">
      <p className="settings-label">Согласия</p>
      {consents.length === 0
        ? <p className="field-note">Записей нет: аккаунт создан до того, как мы начали фиксировать редакции документов.</p>
        : <ul className="consent-list">
            {consents.map((consent) => (
              <li key={`${consent.kind}-${consent.version}`}>
                <b>{isConsentKind(consent.kind) ? CONSENT_LABELS[consent.kind] : consent.kind}</b>
                <span>
                  редакция {consent.version} · {consentDate.format(consent.acceptedAt)}
                  {consent.withdrawnAt && ` · отозвано ${consentDate.format(consent.withdrawnAt)}`}
                </span>
              </li>
            ))}
          </ul>}
      <p className="field-note">
        Отзыв согласия на обработку данных о питании — это удаление аккаунта: без них дневник
        не работает. Публикация снимков в каталоге — другое дело, она отзывается отдельно.
      </p>
      {photoConsent && <PhotoConsent />}
      <div className="legal-links">
        <Link href="/legal/terms">Соглашение</Link>
        <Link href="/legal/privacy">Конфиденциальность</Link>
        <Link href="/legal/consent">Согласие</Link>
        <Link href="/legal/cookies">Cookie</Link>
      </div>
    </section>
    <section className="settings-block danger-zone">
      <p className="settings-label">Удаление аккаунта</p>
      <DangerZone />
    </section>
  </main>;
}
