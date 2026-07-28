"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchToday, type TodayResponse } from "./api";
import { AddTab } from "./add-tab";
import { IconAdd, IconSuggest, IconToday } from "./icons";
import { LinkScreen } from "./link-screen";
import { SuggestTab } from "./suggest-tab";
import { TodayTab } from "./today-tab";
import { applyTheme, getWebApp, haptic } from "./telegram";

type Tab = "today" | "add" | "suggest";
type Status = "loading" | "ready" | "needs_link" | "no_telegram" | "error";

const TABS: Array<{ key: Tab; label: string; Icon: (props: { active?: boolean }) => React.ReactElement }> = [
  { key: "today", label: "Сегодня", Icon: IconToday },
  { key: "add", label: "Добавить", Icon: IconAdd },
  { key: "suggest", label: "Совет", Icon: IconSuggest },
];

export default function MiniApp() {
  const [status, setStatus] = useState<Status>("loading");
  const [tab, setTab] = useState<Tab>("today");
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);

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

  function switchTab(next: Tab) {
    haptic("tap");
    setTab(next);
  }

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
      {tab === "today" && <TodayTab data={today} firstName={firstName} onAdd={() => switchTab("add")} />}
      {tab === "add" && <AddTab
        showCalories={today.showCalories}
        onSaved={() => { haptic("success"); setTab("today"); void load(); }}
      />}
      {tab === "suggest" && <SuggestTab showCalories={today.showCalories} />}
    </div>

    <nav className="tg-tabs" role="tablist">
      {TABS.map(({ key, label, Icon }) => <button
        key={key}
        role="tab"
        aria-selected={tab === key}
        className={tab === key ? "active" : ""}
        onClick={() => switchTab(key)}
      >
        <Icon active={tab === key} />
        <span>{label}</span>
      </button>)}
    </nav>
  </div>;
}
