"use client";

// Разовая диагностика сканера штрихкодов. Открывать внутри Telegram по
// адресу /tg/scan-test.
//
// Зачем страница, а не рассуждение. Решение «делать штрихкоды или нет»
// упирается в вопрос, на который нет надёжного ответа в документации:
// читает ли `showScanQrPopup` штрихкоды EAN-13. Официально он описан только
// для QR, а в Desktop- и Web-клиентах не работает вовсе
// (docs/market-research.md, раздел 8). Проверяется это ровно одним
// способом — навести настоящий телефон на настоящую пачку.
//
// Экран одноразовый: как только ответ получен и записан в исследование,
// каталог `app/tg/scan-test` удаляется. В навигацию он не добавлен и в
// поиск не попадает — `/tg` целиком закрыт в robots.ts.

import { useEffect, useState } from "react";
import { getWebApp } from "../telegram";

type Row = { label: string; value: string };

export default function ScanTestPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [scanned, setScanned] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Собираем всё одной асинхронной функцией и присваиваем один раз в конце:
  // синхронный setState в теле эффекта запрещён правилом
  // react-hooks/set-state-in-effect, и в остальных экранах Mini App
  // (inbox-tab.tsx, profile-tab.tsx) используется ровно эта форма.
  useEffect(() => {
    let cancelled = false;

    async function collect() {
      const webApp = getWebApp() as (ReturnType<typeof getWebApp> & {
        version?: string;
        platform?: string;
        showScanQrPopup?: (params: { text?: string }, cb: (text: string) => boolean | void) => void;
      }) | null;
      const detector = (window as unknown as {
        BarcodeDetector?: { getSupportedFormats?: () => Promise<string[]> };
      }).BarcodeDetector;

      const collected: Row[] = [
        { label: "Telegram WebApp", value: webApp ? "есть" : "нет — открыто не из Telegram" },
        { label: "Версия клиента", value: webApp?.version ?? "—" },
        { label: "Платформа", value: webApp?.platform ?? "—" },
        { label: "showScanQrPopup", value: typeof webApp?.showScanQrPopup === "function" ? "есть" : "нет" },
        { label: "BarcodeDetector в WebView", value: detector ? "есть" : "нет" },
      ];

      // Какие форматы умеет встроенный детектор браузера: если в списке есть
      // ean_13, сканер можно сделать своими силами, без сторонней библиотеки.
      if (detector?.getSupportedFormats) {
        const formats = await detector.getSupportedFormats().catch(() => null);
        collected.push({
          label: "Форматы BarcodeDetector",
          value: formats ? formats.join(", ") || "—" : "не отдал список",
        });
      }

      if (!cancelled) setRows(collected);
    }

    void collect();
    return () => { cancelled = true; };
  }, []);

  function openScanner() {
    const webApp = getWebApp() as (ReturnType<typeof getWebApp> & {
      showScanQrPopup?: (params: { text?: string }, cb: (text: string) => boolean | void) => void;
    }) | null;
    if (typeof webApp?.showScanQrPopup !== "function") {
      setNote("Этот клиент Telegram сканер не открывает.");
      return;
    }
    setNote(null);
    webApp.showScanQrPopup({ text: "Наведите на штрихкод упаковки" }, (text) => {
      setScanned(text);
      // true закрывает окно сканера — иначе оно ловит коды дальше.
      return true;
    });
  }

  return <div className="tg-page">
    <header className="tg-hero">
      <p className="tg-kicker">Диагностика</p>
      <h1>Сканер штрихкодов</h1>
      <p className="tg-hint">
        Служебный экран. Нажмите кнопку и наведите камеру на штрихкод любой упаковки — нужно понять,
        отдаёт ли Telegram цифры EAN-13 или умеет только QR.
      </p>
    </header>

    <section className="tg-card">
      <dl className="tg-diag">
        {rows.map((row) => <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>)}
      </dl>
    </section>

    <button className="tg-button tg-button-block" onClick={openScanner}>Открыть сканер</button>
    {note && <p className="tg-error">{note}</p>}

    {scanned !== null && <section className="tg-card">
      <p className="tg-kicker">Что вернул сканер</p>
      <p className="tg-diag-result">{scanned || "(пустая строка)"}</p>
      <p className="tg-hint">
        {/^\d{8,14}$/.test(scanned)
          ? "Это похоже на штрихкод: сканер Telegram читает EAN-13, отдельная библиотека не нужна."
          : "На штрихкод не похоже — скорее всего, прочитан QR или сканер вернул что-то своё."}
      </p>
    </section>}
  </div>;
}
