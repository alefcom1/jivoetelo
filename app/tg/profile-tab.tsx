"use client";

// Экран «Профиль»: цели, измерения, настройки напоминаний, документы и выход.
// Из макета сознательно не перенесены чат со специалистом, подписка Pro и
// база рецептов — их в продукте нет, а заглушка хуже отсутствующего раздела
// (раздел 3 docs/miniapp-v2.md).

import { useEffect, useRef, useState } from "react";
import { LEGAL_PAGES, NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import {
  MAX_HEIGHT_CM,
  MAX_KCAL_OVERRIDE,
  MIN_HEIGHT_CM,
  MIN_KCAL_OVERRIDE,
} from "@/lib/onboarding";
import { PACE_OPTIONS, type PaceKey } from "@/lib/pace";
import { ACTIVITY_LABELS, GOAL_LABELS, type Activity, type Goal } from "@/lib/targets";
import { MAX_DIGEST_HOUR, MIN_DIGEST_HOUR } from "@/lib/reminders";
import {
  addMeasurement,
  fetchProfile,
  saveGoals,
  saveReminders,
  scanScale,
  snoozeReminders,
  unlinkTelegram,
  type ProfileResponse,
} from "./plan-profile-api";
import { ApiError } from "./api";
import { haptic, openExternal } from "./telegram";
import { CameraSettings } from "../camera-settings";

/** Число по-русски: десятые через запятую. В поля ввода не идёт — только в текст. */
const ru = (value: number) => String(value).replace(".", ",");

const DIGEST_HOURS = Array.from({ length: MAX_DIGEST_HOUR - MIN_DIGEST_HOUR + 1 }, (_, i) => MIN_DIGEST_HOUR + i);

/**
 * Монограмма вместо аватара. Аватар у Telegram есть (`initDataUnsafe.user.
 * photo_url`), но лежит он на его CDN — это внешний хост в интерфейсе,
 * который обязан открываться и без доступа к нему. Буква и тон, выведенные
 * из самого адреса почты, дают то же узнавание без единого запроса наружу и
 * при этом у каждого человека свои.
 */
function Monogram({ email }: { email: string | null }) {
  const source = email ?? "";
  const letter = (source.trim()[0] ?? "Ж").toUpperCase();
  // Простая устойчивая свёртка: одна и та же почта — всегда один и тот же
  // цвет, на любом устройстве и после любой перезагрузки.
  let sum = 0;
  for (const char of source) sum = (sum + char.charCodeAt(0) * 31) % 360;
  return <span className="tg-profile-avatar" style={{ "--food-hue": sum } as React.CSSProperties} aria-hidden>
    {letter}
  </span>;
}

/**
 * Откуда взялась норма — по шагам.
 *
 * До этого блока число появлялось на экране без единого слова о
 * происхождении, и это было единственное место в продукте, где мы просили
 * верить на слово. Для сервиса, который отказался от ложной точности ради
 * диапазона, странно вдвойне: мы говорим «мы не уверены», но не говорим,
 * в чём именно.
 *
 * Показываем свёрнутым: большинству достаточно самого числа, а тем, кто
 * спросит «почему столько», ответ должен быть под рукой, а не в поддержке.
 */
function TargetsBreakdown({ targets }: { targets: ProfileResponse["targets"] }) {
  if (!targets) return null;
  const { values, steps } = targets;

  return <details className="tg-explain">
    <summary>
      {values.source === "manual"
        ? `Норма ${values.kcalTarget} ккал — ваша`
        : `Норма ${values.kcalMin}–${values.kcalMax} ккал — откуда`}
    </summary>
    <ol className="tg-explain-steps">
      {steps.map((step, index) => <li key={index}>
        <b>{step.kcal}</b>
        <span>{step.label}</span>
        {step.note && <i>{step.note}</i>}
      </li>)}
    </ol>
    {values.source === "formula" && <p className="tg-hint">
      Диапазон, а не точка: формула Миффлина–Сан Жеора даёт оценку, а не
      измерение. Разброс между людьми одного роста и веса доходит до 15%.
    </p>}
  </details>;
}

function GoalsSection({ profile, onSaved }: { profile: ProfileResponse; onSaved: () => void }) {
  const { goals, paceResult, latestWeightKg, targets } = profile;
  const [goal, setGoal] = useState<Goal>(goals?.goal ?? "maintain");
  const [activity, setActivity] = useState<Activity>(goals?.activity ?? "light");
  const [height, setHeight] = useState(goals?.heightCm != null ? String(goals.heightCm) : "");
  const [targetWeight, setTargetWeight] = useState(goals?.targetWeightKg != null ? String(goals.targetWeightKg) : "");
  const [pace, setPace] = useState<PaceKey>(goals?.pace ?? "moderate");
  const [ownKcal, setOwnKcal] = useState(goals?.kcalOverride != null ? String(goals.kcalOverride) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!goals) {
    return <section className="tg-section">
      <h2>Мои цели</h2>
      <div className="tg-card tg-hint-card">
        <p>Стартовый план ещё не настроен — цели появятся здесь после него.</p>
        <a className="tg-link" href="/app/onboarding" target="_blank" rel="noreferrer">Настроить план →</a>
      </div>
    </section>;
  }

  /** Число из поля: пусто — null, запятая понимается как точка. */
  function parseField(raw: string): number | null {
    const trimmed = raw.trim();
    return trimmed === "" ? null : Number(trimmed.replace(",", "."));
  }

  async function handleSave() {
    setBusy(true);
    setError(null);

    const weightValue = parseField(targetWeight);
    if (weightValue !== null && (!Number.isFinite(weightValue) || weightValue < 30 || weightValue > 300)) {
      setError("Целевой вес должен быть от 30 до 300 кг.");
      setBusy(false);
      return;
    }
    const heightValue = parseField(height);
    if (heightValue === null || !Number.isFinite(heightValue) || heightValue < MIN_HEIGHT_CM || heightValue > MAX_HEIGHT_CM) {
      setError(`Рост должен быть от ${MIN_HEIGHT_CM} до ${MAX_HEIGHT_CM} см.`);
      setBusy(false);
      return;
    }
    const overrideValue = parseField(ownKcal);
    if (overrideValue !== null && (!Number.isFinite(overrideValue) || overrideValue < MIN_KCAL_OVERRIDE || overrideValue > MAX_KCAL_OVERRIDE)) {
      setError(`Своя норма — от ${MIN_KCAL_OVERRIDE} до ${MAX_KCAL_OVERRIDE} ккал.`);
      setBusy(false);
      return;
    }

    try {
      await saveGoals({
        goal,
        activity,
        heightCm: heightValue,
        targetWeightKg: weightValue,
        // Темп осмыслен только при снижении — для остальных целей отправляем
        // null, иначе он остался бы висеть от прошлой цели.
        pace: goal === "lose" ? pace : null,
        kcalOverride: overrideValue,
      });
      haptic("success");
      onSaved();
    } catch {
      haptic("error");
      setError("Не получилось сохранить. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="tg-section">
    <h2>Мои цели</h2>
    <div className="tg-card tg-profile-goals">
      <p className="tg-field-label">Цель</p>
      <div className="tg-segment tg-segment-wrap">
        {(Object.keys(GOAL_LABELS) as Goal[]).map((key) => <button
          key={key}
          className={goal === key ? "active" : ""}
          onClick={() => { haptic("tap"); setGoal(key); }}
        >{GOAL_LABELS[key]}</button>)}
      </div>

      <p className="tg-field-label">Активность</p>
      <div className="tg-segment tg-segment-wrap">
        {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((key) => <button
          key={key}
          className={activity === key ? "active" : ""}
          onClick={() => { haptic("tap"); setActivity(key); }}
        >{ACTIVITY_LABELS[key]}</button>)}
      </div>

      <label className="tg-field">
        Рост, см
        <input
          className="tg-input"
          type="number" inputMode="numeric" min={MIN_HEIGHT_CM} max={MAX_HEIGHT_CM} step="1"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
        />
      </label>

      <label className="tg-field">
        Целевой вес, кг
        <input
          className="tg-input"
          type="number" inputMode="decimal" min={30} max={300} step="0.1"
          placeholder="не задан"
          value={targetWeight}
          onChange={(e) => setTargetWeight(e.target.value)}
        />
      </label>

      {goal === "lose" && <>
        <p className="tg-field-label">Темп снижения</p>
        <div className="tg-segment tg-segment-wrap">
          {PACE_OPTIONS.map((option) => <button
            key={option.key}
            className={pace === option.key ? "active" : ""}
            onClick={() => { haptic("tap"); setPace(option.key); }}
          >{option.label}</button>)}
        </div>
        <p className="tg-hint">{PACE_OPTIONS.find((o) => o.key === pace)?.note}</p>

        {paceResult && latestWeightKg && <div className="tg-plan-weight-stats">
          <div><strong>{paceResult.kgPerWeek}</strong><span>кг в неделю</span></div>
          <div><strong>−{paceResult.dailyDeficit}</strong><span>дефицит, ккал</span></div>
          {paceResult.weeksToGoal !== null && <div><strong>{paceResult.weeksToGoal}</strong><span>недель до цели</span></div>}
        </div>}
      </>}

      {/* Своя норма — последней и с объяснением: это выход из расчёта, а не
          ещё одна его настройка. Человеку, которому норму назначил врач,
          важнее, чтобы сервис не спорил, чем чтобы он был прав. */}
      <label className="tg-field">
        Своя норма, ккал
        <input
          className="tg-input"
          type="number" inputMode="numeric" min={MIN_KCAL_OVERRIDE} max={MAX_KCAL_OVERRIDE} step="10"
          placeholder="считаем по формуле"
          value={ownKcal}
          onChange={(e) => setOwnKcal(e.target.value)}
        />
      </label>
      <p className="tg-hint">
        {ownKcal.trim() === ""
          ? "Пусто — норму считает формула. Заполните, если её назначил врач или тренер: тогда расчёт отключится."
          : "Формула и адаптивная поправка отключены. Очистите поле, чтобы вернуть расчёт."}
      </p>

      <TargetsBreakdown targets={targets} />

      {error && <p className="tg-error">{error}</p>}
      <button className="tg-button tg-button-block" onClick={() => void handleSave()} disabled={busy}>
        {busy ? "Сохраняем…" : "Сохранить цели"}
      </button>
    </div>
  </section>;
}

/**
 * Награды — список, куда можно вернуться.
 *
 * Карточка на «Сегодня» показывается один раз в день взятия: как событие
 * этого достаточно, как памяти — нет. Вопрос «а что у меня есть» возникает не
 * в тот день, а через месяц.
 *
 * Ни полоски «до следующей осталось», ни серых силуэтов невзятого. И то, и
 * другое превращает наблюдение за собой в задание с оценкой — ровно то, от
 * чего сервис отстроен (lib/first-run.ts, раздел «Чего здесь нет»).
 */
function AwardsSection({ profile, onInvite }: { profile: ProfileResponse; onInvite?: () => void }) {
  const { awards } = profile;
  return <section className="tg-section">
    <h2>Награды</h2>
    <div className="tg-card">
      {awards.length === 0
        ? <p className="tg-hint">Пока пусто. Первая появится на третий день с записями — и покажет, что открылось.</p>
        : <ul className="tg-awards">
            {awards.map((award) => <li key={award.key}>
              <div>
                <b>{award.title}</b>
                <p>{award.note}</p>
              </div>
              <time dateTime={award.earnedOn}>
                {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${award.earnedOn}T12:00:00Z`))}
              </time>
            </li>)}
          </ul>}
      {onInvite && <button className="tg-link-button" onClick={onInvite}>Позвать друга</button>}
    </div>
  </section>;
}

/**
 * Тариф и оплата.
 *
 * Кнопка уводит на страницу Tribute через `openExternal`, а не открывает
 * оплату внутри нашего экрана. Так деньги принимает Tribute, а не наш бот, —
 * и правило Telegram о продаже цифровых товаров за Stars остаётся его
 * заботой, а не нашей.
 *
 * Ссылки приходят с сервера готовыми: в каждой подписанная метка человека,
 * иначе оплату не к кому отнести (lib/payments/tribute.ts). Если оплата не
 * настроена или выключена, `links` приходит пустым — блок тогда честно
 * говорит, чем доступ открыт, и не показывает кнопок, ведущих в никуда.
 */
function AccessSection({ profile }: { profile: ProfileResponse }) {
  const { access } = profile;
  const open = access.plan === "premium";
  // Три состояния, а не два. «Платный доступ открыт» человеку, который идёт
  // по пробному месяцу, — обещание списания, которого не было.
  const line = !open
    ? "Пробный месяц закончился. Дневник, план, вес, обзоры и каталог остались — еду можно записывать руками. Разбор открывается оплатой или приглашением: за каждого друга месяц вам и ему."
    : access.trial
      ? `Идёт пробный месяц: разбор по фото, по описанию и голосом открыт ещё ${access.daysLeft} дн.`
      : `Доступ открыт ещё ${access.daysLeft} дн. Разбор по фото, по описанию и голосом работает полностью.`;
  return <section className="tg-section">
    <h2>Доступ</h2>
    <div className="tg-card tg-access">
      <p className="tg-hint">{line}</p>
      {access.links?.map((link) => (
        <button
          key={link.key}
          className="tg-button tg-button-block"
          onClick={() => { haptic("tap"); openExternal(link.url); }}
        >
          {open ? "Продлить" : "Оплатить"} — {link.label.toLowerCase()}, {link.priceRub} ₽
        </button>
      ))}
      {access.links && <p className="tg-hint">
        Оплата проходит на стороне Tribute. Доступ откроется сам в течение минуты — вернитесь сюда
        и потяните экран вниз, чтобы обновить.
      </p>}
    </div>
  </section>;
}

function MeasurementsSection({ profile, onSaved }: { profile: ProfileResponse; onSaved: () => void }) {
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Снимок весов: читает число, но не сохраняет его.
   *
   * Подставляется в то же поле, где вес набирают руками, и записывается той же
   * кнопкой. Почему не сохраняем сразу — в lib/scale-reading.ts: ошибка в
   * разряде десятков на семисегментном индикаторе выглядит обычным весом,
   * уходит в тренд и двигает план.
   */
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleScan(file: File | null) {
    if (!file) return;
    setScanning(true);
    setScanNote(null);
    setError(null);
    try {
      const result = await scanScale(file);
      if (result.ok) {
        haptic("success");
        // В поле — точка, и только точка. Оно `type="number"`, а число с
        // запятой такое поле молча считает недействительным и показывает
        // пустым: в состоянии значение есть, на экране его нет. Русская
        // запятая остаётся человеку — в тексте рядом.
        setWeight(String(result.weightKg));
        setScanNote(result.warning ?? `Прочитала ${ru(result.weightKg)} кг — проверьте и добавьте.`);
      } else {
        haptic("error");
        setScanNote(result.message);
      }
    } catch (e) {
      haptic("error");
      setScanNote((e instanceof ApiError ? e.failure.message : null) ?? "Не получилось прочитать снимок.");
    } finally {
      setScanning(false);
      // Сброс выбора: повторный снимок того же файла иначе не вызовет change,
      // и человеку покажется, что кнопка перестала работать.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAdd() {
    const value = Number(weight.trim().replace(",", "."));
    if (!Number.isFinite(value) || value < 30 || value > 300) {
      setError("Вес должен быть от 30 до 300 кг.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addMeasurement(value);
      haptic("success");
      setWeight("");
      onSaved();
    } catch {
      haptic("error");
      setError("Не получилось сохранить замер.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="tg-section">
    <h2>Измерения</h2>
    <div className="tg-card">
      <p className="tg-hint">
        {profile.latestWeightKg !== null
          ? `Последний замер: ${profile.latestWeightKg} кг.`
          : "Замеров веса ещё нет."}
      </p>

      <div className="tg-profile-add-weight">
        <input
          className="tg-input" type="number" inputMode="decimal" step="0.1" min={30} max={300}
          placeholder="вес сегодня, кг" value={weight} onChange={(e) => setWeight(e.target.value)}
        />
      </div>

      {/* Обе кнопки одной строкой: это два способа одного действия, и
          разнесённые по строкам они читались бы как разные по важности. Поле
          занимает свою строку целиком — втроём на телефоне не помещаются.

          Ярлык поверх скрытого input: системная кнопка выбора файла подписана
          на языке телефона и посреди русского экрана выглядит чужой. Сам input
          остаётся в разметке — прячем размером, а не display:none. */}
      <div className="tg-weight-actions">
        <button className="tg-button" onClick={() => void handleAdd()} disabled={busy || weight.trim() === ""}>
          {busy ? "…" : "Добавить"}
        </button>
        <label className="tg-scale-scan">
          <input
            ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={scanning}
            onChange={(e) => void handleScan(e.target.files?.[0] ?? null)}
          />
          <span>{scanning ? "Читаю…" : "Снять с весов"}</span>
        </label>
      </div>
      {scanNote && <p className="tg-hint">{scanNote}</p>}
      {error && <p className="tg-error">{error}</p>}

      {profile.recentWeights.length > 0 && <ul className="tg-profile-weights">
        {profile.recentWeights.map((entry) => <li key={entry.onDate}>
          <span>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${entry.onDate}T12:00:00Z`))}</span>
          <b>{entry.weightKg} кг</b>
        </li>)}
      </ul>}
      <p className="tg-hint">Полный график и тренд — на вкладке «План».</p>
    </div>
  </section>;
}

function RemindersSection({ profile, onSaved }: { profile: ProfileResponse; onSaved: () => void }) {
  const { reminders } = profile;
  const [enabled, setEnabled] = useState(reminders.remindersEnabled);
  const [hour, setHour] = useState(reminders.digestHour);
  const [weighEnabled, setWeighEnabled] = useState(reminders.weighRemindersEnabled);
  const [busy, setBusy] = useState<"save" | "snooze" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snoozedUntilDate = reminders.snoozedUntil ? new Date(reminders.snoozedUntil) : null;
  const snoozeActive = snoozedUntilDate !== null && snoozedUntilDate > new Date();

  async function handleSave() {
    setBusy("save");
    setError(null);
    try {
      await saveReminders({ remindersEnabled: enabled, digestHour: hour, weighRemindersEnabled: weighEnabled });
      haptic("success");
      onSaved();
    } catch {
      haptic("error");
      setError("Не получилось сохранить.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSnooze() {
    setBusy("snooze");
    setError(null);
    try {
      await snoozeReminders();
      haptic("success");
      onSaved();
    } catch {
      haptic("error");
      setError("Не получилось поставить паузу.");
    } finally {
      setBusy(null);
    }
  }

  return <section className="tg-section">
    <h2>Напоминания</h2>
    <div className="tg-card">
      <label className="tg-check">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Присылать вечернее напоминание в Telegram</span>
      </label>

      <label className="tg-field">
        Не раньше
        <select className="tg-input" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
          {DIGEST_HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
        </select>
      </label>

      <p className="tg-hint">Не больше одного сообщения в день, и только если есть о чём: неразобранные снимки или совсем пустой день. Ночью бот молчит.</p>

      {/* Отдельный переключатель, а не строка внутри вечерних: выключив
          разговор про еду, человек не соглашался вместо него получать «встаньте
          на весы». И наоборот — вести дневник, не взвешиваясь, законно. */}
      <label className="tg-check">
        <input type="checkbox" checked={weighEnabled} onChange={(e) => setWeighEnabled(e.target.checked)} />
        <span>Напоминать взвеситься по утрам</span>
      </label>
      <p className="tg-hint">
        Не чаще раза в неделю и только если замеров давно не было. Вес можно прислать боту одним
        сообщением — «72,4», больше ничего делать не нужно.
      </p>

      {snoozeActive && snoozedUntilDate && <p className="tg-hint">
        Сейчас пауза до {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(snoozedUntilDate)}. Сохранение снимет её.
      </p>}

      {error && <p className="tg-error">{error}</p>}
      <div className="tg-profile-reminder-actions">
        <button className="tg-button" onClick={() => void handleSave()} disabled={busy !== null}>
          {busy === "save" ? "Сохраняем…" : "Сохранить"}
        </button>
        {enabled && !snoozeActive && <button className="tg-link-button" onClick={() => void handleSnooze()} disabled={busy !== null}>
          {busy === "snooze" ? "…" : "Пауза на 3 дня"}
        </button>}
      </div>
    </div>
  </section>;
}

/**
 * @param onUnlinked Вызывается после успешной отвязки Telegram. Своей сессии
 * у Mini App нет — авторизация идёт по initData при каждом запросе, — поэтому
 * «выход» обнуляет саму привязку аккаунта. Оболочке (app/tg/page.tsx) после
 * этого нужно показать экран привязки заново, например `setStatus("needs_link")`.
 */
export function ProfileTab({ onUnlinked, onInvite }: { onUnlinked?: () => void; onInvite?: () => void }) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  // Первая загрузка — эффект-локальная функция с флагом отмены (та же
  // форма, что в inbox-tab.tsx): setState вызывается прямо внутри эффекта,
  // а не через функцию, объявленную снаружи, — так требует правило
  // react-hooks/set-state-in-effect. `load` ниже — для повторной загрузки
  // после сохранения формы, из обработчика клика, а не из эффекта.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const result = await fetchProfile();
        if (!cancelled) { setData(result); setError(null); }
      } catch {
        if (!cancelled) setError("Не получилось загрузить профиль.");
      }
    }
    void run();
    return () => { cancelled = true; };
  }, []);

  async function load() {
    try {
      const result = await fetchProfile();
      setData(result);
      setError(null);
    } catch {
      setError("Не получилось загрузить профиль.");
    }
  }

  async function handleUnlink() {
    if (!window.confirm("Отвязать Telegram? Понадобится новый код из веб-версии, чтобы снова открыть Mini App.")) return;
    setUnlinking(true);
    try {
      await unlinkTelegram();
      haptic("success");
      onUnlinked?.();
    } catch {
      haptic("error");
      setError("Не получилось отвязать аккаунт.");
    } finally {
      setUnlinking(false);
    }
  }

  if (!data) {
    return <div className="tg-page">
      <header className="tg-hero"><h1>Профиль</h1></header>
      {error ? <p className="tg-error">{error}</p> : <div className="tg-spinner" aria-label="Загрузка" />}
    </div>;
  }

  return <div className="tg-page">
    <section className="tg-card tg-profile-head">
      <Monogram email={data.email} />
      <div className="tg-profile-head-body">
        <h1>Профиль</h1>
        {/* Аккаунт из Mini App живёт без почты. Показываем это прямо, а не
            пустой строкой: пустое место читается как ошибка загрузки. */}
        <p>{data.email ?? "Вход через Telegram"}</p>
      </div>
    </section>

    {/* Строка про «бесплатный тариф — доступны все возможности» стояла здесь
        до августа 2026 и пережила смену модели. Бесплатного тарифа больше
        нет, есть пробный месяц, — и надпись оказалась прямо над разделом
        «Доступ», который говорил обратное: один экран противоречил сам себе.
        Про доступ теперь говорит только AccessSection, в одном месте. */}
    <section className="tg-card">
      <a className="tg-link" href="/app/settings" target="_blank" rel="noreferrer">Данные, согласия и удаление аккаунта — в веб-версии →</a>
    </section>

    {/* Шпаргалка. Подсказки на «Сегодня» показываются один раз и не
        возвращаются — здесь их можно перечитать, когда вопрос возникнет. */}
    <section className="tg-card">
      <p className="tg-hint">Все объяснения на одной странице: запись еды, кольцо, дневник, вес, неделя.</p>
      <a className="tg-link" href="/app/pomosch" target="_blank" rel="noreferrer">Как всё устроено →</a>
    </section>

    <AccessSection profile={data} />

    <AwardsSection profile={data} onInvite={onInvite} />

    <GoalsSection profile={data} onSaved={load} />
    <MeasurementsSection profile={data} onSaved={load} />
    <RemindersSection profile={data} onSaved={load} />

    <section className="tg-section">
      <h2>Камера</h2>
      <div className="tg-card tg-camera-settings">
        <CameraSettings variant="tg" />
      </div>
    </section>

    {error && <p className="tg-error">{error}</p>}

    <footer className="tg-legal">
      <p>{NOT_MEDICAL_DISCLAIMER}</p>
      <div>
        {LEGAL_PAGES.map((page) => <a key={page.href} href={page.href} target="_blank" rel="noreferrer">{page.short}</a>)}
      </div>
    </footer>

    <button className="tg-link-button" onClick={() => void handleUnlink()} disabled={unlinking}>
      {unlinking ? "Отвязываем…" : "Отвязать Telegram и выйти"}
    </button>
  </div>;
}
