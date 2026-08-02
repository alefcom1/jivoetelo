"use client";

import { useCallback, useEffect, useState } from "react";
import { localToday } from "@/lib/dates";
import { ApiError, fetchToday, type InboxItemDto, type TodayResponse } from "./api";
import { CameraTab } from "./camera-tab";
import { DiaryTab } from "./diary-tab";
import { IconAdd, IconInbox, IconPlan, IconProfile, IconToday } from "./icons";
import { InboxTab } from "./inbox-tab";
import { LinkScreen } from "./link-screen";
import { PlanTab } from "./plan-tab";
import { ProfileTab } from "./profile-tab";
import { TodayTab } from "./today-tab";
import { applyTheme, getWebApp, haptic, useBackButton } from "./telegram";

// Пять вкладок раздела «Пять вкладок» спецификации Mini App v2 (docs/miniapp-v2.md).
// «Камера» — эволюция прежней «Добавить»: тот же экран, разбор теперь мгновенный.
type Tab = "today" | "diary" | "camera" | "plan" | "profile";
type Status = "loading" | "ready" | "needs_link" | "no_telegram" | "error";

const TABS: Array<{ key: Tab; label: string; Icon: (props: { active?: boolean }) => React.ReactElement }> = [
  { key: "today", label: "Сегодня", Icon: IconToday },
  { key: "diary", label: "Дневник", Icon: IconInbox },
  { key: "camera", label: "Камера", Icon: IconAdd },
  { key: "plan", label: "План", Icon: IconPlan },
  { key: "profile", label: "Профиль", Icon: IconProfile },
];

export default function MiniApp() {
  const [status, setStatus] = useState<Status>("loading");
  const [tab, setTab] = useState<Tab>("today");
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  // Инбокс в v2 — не вкладка, а экран, на который можно перейти строкой с
  // «Сегодня» (раздел «Три отличия от макета» спецификации). Он не входит в
  // `tab`, чтобы нижняя панель по-прежнему подсвечивала одну из пяти вкладок.
  const [inboxOpen, setInboxOpen] = useState(false);
  // Снимок, выбранный в инбоксе: разбор идёт тем же экраном «Камера», что и
  // обычное добавление, поэтому второго редактора черновика не появляется.
  const [inboxItem, setInboxItem] = useState<InboxItemDto | null>(null);
  // Приём пищи, открытый нажатием на «Сегодня». Хранится здесь, а не в
  // «Дневнике»: выбор происходит на одной вкладке, а показывается на другой.
  const [openMealId, setOpenMealId] = useState<number | null>(null);
  /**
   * Откуда открыли «Камеру» и за какой день делается запись. Раньше «Камера»
   * всегда возвращала на «Сегодня» и всегда сохраняла сегодняшним числом —
   * даже когда её открыли из «Дневника», листая прошлую неделю. Обе ошибки
   * из одного места: экран не знал, откуда пришёл.
   */
  const [cameraFrom, setCameraFrom] = useState<{ tab: Tab; day: string | null }>({ tab: "today", day: null });
  /** Открытый день «Дневника» — здесь, а не внутри вкладки: переключение
   * вкладки размонтирует экран, и после «Камеры» человек возвращался бы на
   * сегодня, а не на тот день, с которого уходил. */
  const [diaryDay, setDiaryDay] = useState(() => localToday());
  /**
   * Как выйти из черновика разбора. Живёт здесь, а не в «Камере», хотя
   * состояние черновика там: нативной кнопкой «назад» должен владеть кто-то
   * один. Будь владельцев двое, они бы затирали друг друга по порядку
   * эффектов, и стрелка залипала бы на экране, который её не показывал.
   */
  const [discardDraft, setDiscardDraft] = useState<(() => void) | null>(null);

  /**
   * Обёртка обязательна: `setState`, получив функцию, считает её обновителем
   * и вызывает вместо того, чтобы сохранить. Без `() => discard` нажатие на
   * «назад» не появлялось бы вовсе, зато черновик сбрасывался бы сам собой
   * в момент своего появления.
   */
  const handleDraft = useCallback((discard: (() => void) | null) => {
    setDiscardDraft(() => discard);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchToday();
      setToday(data);
      setStatus("ready");
    } catch (error) {
      if (error instanceof ApiError && error.failure.reason === "not_linked") setStatus("needs_link");
      else if (error instanceof ApiError && error.failure.reason === "invalid_signature") setStatus("no_telegram");
      else setStatus("error");
    }
  }, []);

  useEffect(() => {
    const webApp = getWebApp();
    if (webApp?.initData) {
      webApp.ready();
      webApp.expand();
      applyTheme(webApp);
    }

    async function bootstrap() {
      if (!webApp || !webApp.initData) {
        setStatus("no_telegram");
        return;
      }
      setFirstName(webApp.initDataUnsafe?.user?.first_name ?? null);
      await load();
    }
    void bootstrap();

    if (!webApp) return;
    const onThemeChanged = () => applyTheme(webApp);
    webApp.onEvent("themeChanged", onThemeChanged);
    return () => webApp.offEvent("themeChanged", onThemeChanged);
  }, [load]);

  /** Переключение нижней панели всегда закрывает инбокс поверх неё. */
  function switchTab(next: Tab) {
    haptic("tap");
    setInboxItem(null);
    setInboxOpen(false);
    // «Камера» из нижней панели — это всегда запись за сегодня с возвратом
    // на «Сегодня»: сюда нажали не из «Дневника», прошлого дня в виду нет.
    if (next === "camera") setCameraFrom({ tab: "today", day: null });
    // Обычное переключение вкладок сбрасывает открытый приём пищи: иначе
    // «Дневник», открытый нижней панелью, каждый раз показывал бы правку
    // последнего, что открывали с «Сегодня».
    setOpenMealId(null);
    setTab(next);
  }

  /** Открыть «Камеру», запомнив, куда возвращаться и за какой день писать. */
  function openCamera(from: Tab, day: string | null = null) {
    haptic("tap");
    setInboxItem(null);
    setInboxOpen(false);
    setCameraFrom({ tab: from, day });
    setTab("camera");
  }

  function handleCameraSaved() {
    haptic("success");
    // Разбор из инбокса возвращает в список инбокса — там могут быть ещё
    // неподтверждённые снимки; обычное добавление — туда, откуда «Камеру»
    // открыли, чтобы человек увидел свою запись в том же списке, где её и
    // заводил.
    if (inboxItem) {
      setInboxItem(null);
      setInboxOpen(true);
    } else {
      setTab(cameraFrom.tab);
    }
    void load();
  }

  /**
   * Куда ведёт нативная кнопка «назад».
   *
   * Порядок — от самого глубокого экрана к самому мелкому, и это и есть
   * стек: черновик разбора → снимок из инбокса → список инбокса → вкладка,
   * отличная от «Сегодня». На «Сегодня» кнопки нет вовсе, и там крестик
   * закрывает приложение — так же, как в самом Telegram.
   *
   * Вкладки — не история, и обычно панель вкладок стрелку не показывает.
   * Здесь показывает сознательно: «Сегодня» у нас действительно главный
   * экран, с которого начинается всё остальное, и возврат к нему одним
   * нажатием честнее, чем закрытие приложения с «Профиля».
   */
  const goBack = discardDraft
    ?? (inboxItem ? () => { haptic("tap"); setInboxItem(null); setInboxOpen(true); }
      : inboxOpen ? () => { haptic("tap"); setInboxOpen(false); }
      : tab !== "today" ? () => { haptic("tap"); setTab("today"); }
      : null);
  useBackButton(status === "ready" ? goBack : null);

  if (status === "loading") {
    return <div className="tg-center"><div className="tg-spinner" aria-label="Загрузка" /></div>;
  }

  if (status === "no_telegram") {
    return <div className="tg-center tg-notice">
      <span className="tg-mark">Ж</span>
      <h1>Живое Тело</h1>
      <p>Это приложение открывается внутри Telegram. Откройте его через бота — или зайдите в веб-версию.</p>
      <a className="tg-button" href="/app">Открыть веб-версию</a>
    </div>;
  }

  if (status === "needs_link") {
    return <LinkScreen onLinked={() => { setStatus("loading"); void load(); }} />;
  }

  if (status === "error" || !today) {
    return <div className="tg-center tg-notice">
      <h1>Не получилось загрузить</h1>
      <p>Проверьте связь и попробуйте ещё раз.</p>
      <button className="tg-button" onClick={() => { setStatus("loading"); void load(); }}>Повторить</button>
    </div>;
  }

  return <div className="tg-app">
    <div className="tg-screen">
      {inboxItem
        ? <CameraTab
            key={inboxItem.id}
            showCalories={today.showCalories}
            inbox={inboxItem}
            onCancelInbox={() => { setInboxItem(null); setInboxOpen(true); }}
            onSaved={handleCameraSaved}
            onDraft={handleDraft}
          />
        : inboxOpen
        ? <InboxTab onPick={(item) => { haptic("tap"); setInboxItem(item); }} onBack={() => setInboxOpen(false)} />
        : <>
            {tab === "today" && <TodayTab
              data={today}
              firstName={firstName}
              onOpenCamera={() => openCamera("today")}
              onOpenInbox={() => { haptic("tap"); setInboxOpen(true); }}
              onOpenMeal={(mealId) => { switchTab("diary"); setOpenMealId(mealId); }}
              onReload={() => void load()}
            />}
            {tab === "diary" && <DiaryTab
              day={diaryDay}
              onDayChange={setDiaryDay}
              onOpenCamera={(day) => openCamera("diary", day)}
              openMealId={openMealId}
            />}
            {tab === "camera" && <CameraTab
              key="manual"
              showCalories={today.showCalories}
              forDay={cameraFrom.day}
              onSaved={handleCameraSaved}
              onDraft={handleDraft}
            />}
            {tab === "plan" && <PlanTab />}
            {tab === "profile" && <ProfileTab />}
          </>}
    </div>

    <nav className="tg-tabs" role="tablist">
      {TABS.map(({ key, label, Icon }) => {
        const active = tab === key && !inboxOpen && !inboxItem;
        return <button
          key={key}
          role="tab"
          aria-selected={active}
          className={active ? "active" : ""}
          onClick={() => switchTab(key)}
        >
          <Icon active={active} />
          <span>{label}</span>
        </button>;
      })}
    </nav>
  </div>;
}
