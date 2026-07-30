"use client";

import { useEffect, useState } from "react";
import { fetchPhoto } from "./api";

type PhotoStatus = "loading" | "ready" | "error";
// Результат храним вместе с ключом, для которого он получен: так при смене
// ключа не нужно синхронно сбрасывать состояние из эффекта (react-hooks не
// зря ругается на setState прямо в теле эффекта — это лишний рендер) —
// рассинхрон result.key !== key сам по себе и есть «идёт загрузка».
type PhotoResult = { key: string; url: string } | { key: string; failed: true };

/**
 * Качает снимок авторизованным fetch (initData в заголовке — см. fetchPhoto)
 * и превращает Blob в objectURL для <img>. Обычный <img src="/api/photos/...">
 * внутри Mini App не работает: WebView не хранит cookie веб-сессии, а initData
 * нельзя положить в query адреса картинки — она осядет в логах, Referer и
 * истории.
 *
 * objectURL обязательно освобождается и при размонтировании, и при смене
 * ключа: иначе при листании списка снимков (инбокс, смена выбранного фото)
 * старые URL накапливаются и держат Blob в памяти — а это телефон в WebView,
 * не десктопная вкладка.
 */
export function usePhotoUrl(key: string | null | undefined): { url: string | null; status: PhotoStatus } {
  const [result, setResult] = useState<PhotoResult | null>(null);

  useEffect(() => {
    // Для пустого ключа эффекту нечего делать — рендер ниже сам покажет
    // ошибку по одному только отсутствию key, без похода в сеть.
    if (!key) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    fetchPhoto(key)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ key, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, failed: true });
      });

    return () => {
      cancelled = true;
      // Смена ключа (следующий снимок инбокса) или уход с экрана — в обоих
      // случаях старый Blob больше не нужен и должен уйти из памяти сразу,
      // а не ждать сборщика мусора.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  if (!key) return { url: null, status: "error" };
  if (!result || result.key !== key) return { url: null, status: "loading" };
  if ("failed" in result) return { url: null, status: "error" };
  return { url: result.url, status: "ready" };
}

/**
 * Единая миниатюра снимка еды для Mini App — используется в превью снимка из
 * инбокса на экране «Добавить» (app/tg/add-tab.tsx) и в списке самого
 * инбокса (app/tg/inbox-tab.tsx), чтобы логика загрузки и освобождения
 * objectURL не копировалась в оба места по отдельности.
 *
 * Пока грузится и при ошибке показывается один и тот же спокойный
 * плейсхолдер, а не сломанная иконка картинки и не пустое место: размер блока
 * задаётся самим компонентом (variant), а не размером содержимого, поэтому
 * вёрстка не «прыгает» при смене состояния.
 */
export function TgPhoto({
  photoKey,
  alt,
  variant = "square",
  className,
}: {
  photoKey: string | null | undefined;
  alt: string;
  /** square — квадратная миниатюра (инбокс), wide — широкое превью (камера). */
  variant?: "square" | "wide";
  className?: string;
}) {
  const { url, status } = usePhotoUrl(photoKey);
  // tg-photo-box, не tg-photo: класс tg-photo уже занят вёрсткой экрана
  // «Добавить» под внешний контейнер вокруг tg-photo-drop (app/tg/add-tab.tsx).
  const classes = ["tg-photo-box", `tg-photo-box--${variant}`, className].filter(Boolean).join(" ");

  return <div className={classes} data-status={status}>
    {status === "ready" && url
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={url} alt={alt} />
      : <span className="tg-photo-box-placeholder" aria-hidden={status === "loading"}>
          {status === "error" ? "Снимок не загрузился" : null}
        </span>}
  </div>;
}
