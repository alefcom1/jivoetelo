"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localToday } from "@/lib/dates";
import { nextHint, passedByData } from "@/lib/first-run";
import { mascotSpeech } from "@/lib/mascot";
import { shouldRefresh } from "@/lib/refresh";
import { ApiError, fetchToday, markHints, type InboxItemDto, type TodayResponse } from "./api";
import { CameraTab } from "./camera-tab";
import { FirstRunHint } from "./first-run-hint";
import { ShareSheet } from "./share-sheet";
import { DiaryTab } from "./diary-tab";
import { IconAdd, IconInbox, IconPlan, IconProfile, IconToday } from "./icons";
import { InboxTab } from "./inbox-tab";
import { LinkScreen } from "./link-screen";
import { MealEditor } from "./meal-editor";
import { PlanTab } from "./plan-tab";
import { ProfileTab } from "./profile-tab";
import { TodayTab } from "./today-tab";
import { ACCESS_ANCHOR } from "@/lib/paid";
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
  /**
   * Стартовая вкладка — «Сегодня», кроме одного случая: бот прислал ссылку с
   * якорем `#dostup`, то есть человек нажал «Открыть тариф».
   *
   * Без этого кнопка про оплату открывала Mini App как есть — на «Сегодня», —
   * и до раздела «Доступ» оставалось ещё два тапа и ни одного указателя.
   * Читаем в инициализаторе, а не эффектом: лишний проход рендера здесь виден
   * глазом, вкладка успевает мигнуть.
   */
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "today";
    return window.location.hash === `#${ACCESS_ANCHOR}` ? "profile" : "today";
  });
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
  /**
   * Приём пищи, открытый на правку прямо с «Сегодня». Живёт в оболочке, а не
   * внутри вкладки (в отличие от такой же правки в «Дневнике», где она —
   * подэкран самой вкладки): нативной кнопкой «назад» владеет оболочка, а на
   * «Сегодня» этой кнопки нет вовсе — без записи в стеке правка оказалась бы
   * экраном, из которого системный жест выбрасывает из приложения.
   */
  const [todayMealId, setTodayMealId] = useState<number | null>(null);
  /** Открытый день «Дневника» — здесь, а не внутри вкладки: переключение
   * вкладки размонтирует экран, и после «Камеры» человек возвращался бы на
   * сегодня, а не на тот день, с которого уходил. */
  const [diaryDay, setDiaryDay] = useState(() => localToday());

  /**
   * Первые шаги. `diaryOpened` живёт в localStorage, а не на сервере: это
   * единственное условие, которое не выводится из данных — «человек заходил
   * в дневник» нигде не записано, а заводить ради подсказки таблицу событий
   * несоразмерно. Локальная память тут честнее: на новом устройстве
   * подсказка появится снова, и это правильно — интерфейс там тоже новый.
   *
   * `dismissed` — закрытые в этой сессии. Сервер узнает о них тем же
   * запросом, но экран должен убрать подсказку сразу, не дожидаясь ответа.
   */
  const [diaryOpened, setDiaryOpened] = useState(() => {
    // Инициализатор, а не эффект: чтение в эффекте вызывает лишний проход
    // рендера. Проверка на window обязательна — этот же код исполняется при
    // серверном рендере страницы, где localStorage нет.
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("jt-diary-opened") === "1"; } catch { return false; }
  });
  const [dismissed, setDismissed] = useState<string[]>([]);
  /**
   * Лист «поделиться». `null` — закрыт; строка — ключ награды, которой
   * делятся; пустая строка — приглашение без повода.
   */
  const [sharing, setSharing] = useState<string | null>(null);
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

  /**
   * Уйти в «Доступ» с экрана, где отказали в разборе.
   *
   * Раздел живёт на вкладке профиля, а переключение вкладок принадлежит
   * оболочке: отдать это самой «Камере» значило бы завести второе место,
   * знающее про устройство навигации.
   */
  const openAccess = useCallback(() => {
    setInboxOpen(false);
    setInboxItem(null);
    setTab("profile");
  }, []);

  /**
   * Когда «Сегодня» в последний раз успешно загрузилось.
   *
   * Нужно, чтобы фоновое обновление не превращалось в шквал запросов: между
   * вкладками люди щёлкают быстро, и без порога каждый щелчок бил бы по сети.
   */
  const loadedAt = useRef(0);

  /**
   * Загрузка «Сегодня».
   *
   * `silent` — фоновое обновление: экран уже показан, и ронять его в ошибку
   * из-за одного неудачного запроса нельзя. Пропавшая на секунду сеть не
   * повод стирать цифры дня; человек этого не просил и не поймёт, что
   * произошло. Поэтому в тихом режиме неудача просто ничего не меняет.
   */
  const load = useCallback(async (silent = false) => {
    try {
      const data = await fetchToday();
      setToday(data);
      setStatus("ready");
      loadedAt.current = Date.now();
    } catch (error) {
      if (silent) return;
      if (error instanceof ApiError && error.failure.reason === "not_linked") setStatus("needs_link");
      else if (error instanceof ApiError && error.failure.reason === "invalid_signature") setStatus("no_telegram");
      else setStatus("error");
    }
  }, []);

  /**
   * Обновить «Сегодня», если данные могли устареть.
   *
   * ## Почему это вообще понадобилось
   *
   * Экран загружался ровно один раз — при монтировании. Переключение вкладок
   * монтирование не повторяет, а Telegram, когда приложение сворачивают, не
   * убивает webview: он остаётся жив со всем состоянием. Отсюда и жалоба —
   * цифры не менялись, пока приложение не закроешь совсем.
   *
   * Устареть за это время может многое, и не только от своих же действий:
   * снимок, отправленный боту в переписке, приходит в инбокс мимо
   * приложения, а `inboxPending` показывается на «Сегодня».
   *
   * ## Три правила
   *
   * Данных нет — грузим обычным порядком, со всеми состояниями ошибок.
   * День сменился — грузим всегда: показывать вчерашние итоги под заголовком
   * «сегодня» нельзя ни при каком пороге. В остальных случаях порог в десять
   * секунд: он гасит щелчки по вкладкам туда-сюда и не мешает вернуться к
   * свежим числам через минуту.
   */
  /**
   * Какую подсказку показать. Состояние собирается из уже пришедших данных —
   * отдельного запроса ради подсказок нет.
   *
   * `passedByData` досылается на сервер при каждой загрузке: тот, кто сделал
   * действие сам, не увидев подсказки, не должен получить её после.
   */
  const hint = today
    ? nextHint({
        seen: [...today.firstRun.seen, ...dismissed],
        hasPlan: today.firstRun.hasPlan,
        loggedDays: today.firstRun.loggedDays,
        mealsToday: today.meals.length,
        botEverUsed: today.firstRun.botEverUsed,
        hasWeight: today.weight !== null,
        diaryOpened,
        showCalories: today.showCalories,
      })
    : null;

  /**
   * Одна реплика Живело за раз.
   *
   * Подсказка и карточка серии — это один и тот же персонаж с одной и той же
   * картинкой. Рядом они читаются как два сообщения подряд от одного
   * собеседника, а мы обещали обратное: одна мысль за раз.
   *
   * Приоритет у вехи: она бывает один день и не повторяется, а подсказка
   * вернётся при следующей загрузке — отмеченной пройденной она становится
   * только когда её закрыли или по ней перешли. В остальные дни карточка
   * серии уступает: подсказка говорит про сейчас, серия — про вообще.
   */
  const milestoneToday = today ? !!mascotSpeech(today.streak).milestone : false;
  /**
   * Карточка награды старше и вехи, и подсказки: рубеж берётся один раз в
   * жизни, а подсказка вернётся при следующей загрузке. Всё вместе — три
   * сообщения от одного персонажа подряд, чего мы не делаем нигде.
   */
  const freshAward = today?.freshAward ?? null;
  const shownHint = freshAward || milestoneToday ? null : hint;

  useEffect(() => {
    if (!today) return;
    const already = new Set(today.firstRun.seen);
    const fresh = passedByData({
      seen: today.firstRun.seen,
      hasPlan: today.firstRun.hasPlan,
      loggedDays: today.firstRun.loggedDays,
      mealsToday: today.meals.length,
      botEverUsed: today.firstRun.botEverUsed,
      hasWeight: today.weight !== null,
      diaryOpened,
      showCalories: today.showCalories,
    }).filter((key) => !already.has(key));
    if (fresh.length > 0) void markHints(fresh);
  }, [today, diaryOpened]);

  const refreshIfStale = useCallback(() => {
    const decision = shouldRefresh({
      dataDay: today?.day ?? null,
      today: localToday(),
      lastLoadedAt: loadedAt.current,
      now: Date.now(),
    });
    if (decision === "skip") return;
    void load(decision === "silent");
  }, [load, today]);

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

  /**
   * Возвращение в приложение.
   *
   * Telegram при сворачивании webview не убивает — он остаётся жив со всем
   * состоянием, и React ничего не перемонтирует. Поэтому «открыл заново» для
   * приложения выглядит как «ничего не произошло», и цифры оставались
   * вчерашними до полного закрытия.
   *
   * Слушаем `visibilitychange` браузера, а не событие Telegram: оно есть во
   * всех клиентах и в вебе, тогда как `activated` появился только в Bot API
   * 8.0 и на десктопе доезжает не везде. `focus` добавлен для десктопа —
   * там переключение между окнами видимость страницы не меняет.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshIfStale);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [refreshIfStale]);

  /** Переключение нижней панели всегда закрывает инбокс поверх неё. */
  function switchTab(next: Tab) {
    haptic("tap");
    setInboxItem(null);
    setInboxOpen(false);
    setTodayMealId(null);
    // «Камера» из нижней панели — это всегда запись за сегодня с возвратом
    // на «Сегодня»: сюда нажали не из «Дневника», прошлого дня в виду нет.
    if (next === "camera") setCameraFrom({ tab: "today", day: null });
    // Обычное переключение вкладок сбрасывает открытый приём пищи: иначе
    // «Дневник», открытый нижней панелью, каждый раз показывал бы правку
    // последнего, что открывали с «Сегодня».
    setOpenMealId(null);
    setTab(next);
    // Возврат на «Сегодня» — повод свериться с сервером: пока человек был на
    // других вкладках, он мог записать приём пищи оттуда, а бот — принять
    // снимок в переписке.
    if (next === "today") refreshIfStale();
    if (next === "diary" && !diaryOpened) {
      setDiaryOpened(true);
      try { localStorage.setItem("jt-diary-opened", "1"); } catch { /* приватный режим */ }
      void markHints(["diary"]);
    }
  }

  /** Открыть «Камеру», запомнив, куда возвращаться и за какой день писать. */
  function openCamera(from: Tab, day: string | null = null) {
    haptic("tap");
    setInboxItem(null);
    setInboxOpen(false);
    setTodayMealId(null);
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
   * стек: черновик разбора → снимок из инбокса → список инбокса → правка
   * записи с «Сегодня» → вкладка, отличная от «Сегодня». На «Сегодня»
   * кнопки нет вовсе, и там крестик закрывает приложение — так же, как в
   * самом Telegram.
   *
   * Вкладки — не история, и обычно панель вкладок стрелку не показывает.
   * Здесь показывает сознательно: «Сегодня» у нас действительно главный
   * экран, с которого начинается всё остальное, и возврат к нему одним
   * нажатием честнее, чем закрытие приложения с «Профиля».
   */
  const goBack = discardDraft
    ?? (inboxItem ? () => { haptic("tap"); setInboxItem(null); setInboxOpen(true); }
      : inboxOpen ? () => { haptic("tap"); setInboxOpen(false); }
      : todayMealId !== null ? () => { haptic("tap"); setTodayMealId(null); }
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
            speechEnabled={today.speechEnabled}
            inbox={inboxItem}
            onCancelInbox={() => { setInboxItem(null); setInboxOpen(true); }}
            onSaved={handleCameraSaved}
            onDraft={handleDraft}
            onOpenAccess={openAccess}
          />
        : inboxOpen
        ? <InboxTab onPick={(item) => { haptic("tap"); setInboxItem(item); }} onBack={() => setInboxOpen(false)} />
        : todayMealId !== null
        ? <MealEditor
            mealId={todayMealId}
            showCalories={today.showCalories}
            backLabel="Сегодня"
            onBack={() => setTodayMealId(null)}
            onChanged={() => { setTodayMealId(null); void load(); }}
          />
        : <>
            {/* Подсказка первых шагов — над содержимым «Сегодня», а не поверх
                него: перекрывать действие, о котором рассказываешь, нельзя. */}
            {tab === "today" && shownHint && <FirstRunHint
              hint={shownHint}
              onDismiss={() => { haptic("tap"); setDismissed((d) => [...d, shownHint.key]); void markHints([shownHint.key]); }}
              onAction={(target) => {
                setDismissed((d) => [...d, shownHint.key]);
                void markHints([shownHint.key]);
                if (target === "camera") openCamera("today");
                // Намерение переводится во вкладку здесь: «неделя» живёт на
                // «Плане», а вносится вес в «Профиле» — там же, где рост и
                // цель. В вебе это три разных адреса, и знать про оба набора
                // разметок модулю правил незачем.
                else switchTab(target === "week" ? "plan" : target === "weight" ? "profile" : target);
              }}
            />}
            {tab === "today" && <TodayTab
              data={today}
              firstName={firstName}
              hideStreak={!!shownHint}
              award={freshAward}
              onShareAward={() => { haptic("tap"); if (freshAward) setSharing(freshAward.key); }}
              onInvite={() => { haptic("tap"); setSharing(""); }}
              onOpenCamera={() => openCamera("today")}
              onOpenInbox={() => { haptic("tap"); setInboxOpen(true); }}
              onOpenMeal={(id) => { haptic("tap"); setTodayMealId(id); }}
              onWeightAdded={() => { void load(); }}
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
              simpleMode={today.simpleMode}
              speechEnabled={today.speechEnabled}
              forDay={cameraFrom.day}
              onSaved={handleCameraSaved}
              onDraft={handleDraft}
              onOpenAccess={openAccess}
            />}
            {tab === "plan" && <PlanTab showCalories={today.showCalories} />}
            {tab === "profile" && <ProfileTab onInvite={() => { haptic("tap"); setSharing(""); }} />}
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

    {/* Лист «поделиться» — последним в дереве и поверх всего: он перекрывает
        и нижнюю панель, иначе из него можно было бы уйти на другую вкладку,
        не закрыв. */}
    {sharing !== null && <ShareSheet awardKey={sharing || undefined} onClose={() => setSharing(null)} />}
  </div>;
}
