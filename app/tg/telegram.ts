"use client";

import { useEffect, useRef } from "react";

// Тонкая типизированная обёртка над window.Telegram.WebApp. Официальный скрипт
// telegram-web-app.js подключается в layout; SDK-обёртки не берём — прототипу
// достаточно нативного API, и он не добавляет вес бандлу.

export type ThemeParams = {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  section_bg_color?: string;
};

type MainButton = {
  text: string;
  show: () => void;
  hide: () => void;
  setText: (text: string) => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
  enable: () => void;
  disable: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  setParams: (params: { color?: string; text_color?: string }) => void;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { first_name?: string } };
  colorScheme: "light" | "dark";
  themeParams: ThemeParams;
  MainButton: MainButton;
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  ready: () => void;
  expand: () => void;
  onEvent: (event: string, cb: () => void) => void;
  offEvent: (event: string, cb: () => void) => void;
};

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
}

/** Мягкая тактильная отдача — только там, где она осмысленна (раздел 10.11). */
export function haptic(kind: "tap" | "success" | "error"): void {
  const hf = getWebApp()?.HapticFeedback;
  if (!hf) return;
  if (kind === "tap") hf.impactOccurred("light");
  else hf.notificationOccurred(kind === "success" ? "success" : "error");
}

/**
 * Переносит палитру Telegram в CSS-переменные, чтобы Mini App совпадал
 * с темой пользователя, сохраняя при этом фирменные акценты «Живого Тела».
 */
export function applyTheme(webApp: TelegramWebApp): void {
  const p = webApp.themeParams ?? {};
  // Переменные ставим на сам .tg-root: там же объявлены значения по умолчанию,
  // и объявление в блоке перекрыло бы унаследованное от :root.
  const scope = document.querySelector<HTMLElement>(".tg-root") ?? document.documentElement;
  const set = (name: string, value?: string) => {
    if (value) scope.style.setProperty(name, value);
  };
  set("--tg-bg", p.secondary_bg_color ?? p.bg_color);
  set("--tg-surface", p.section_bg_color ?? p.bg_color);
  set("--tg-text", p.text_color);
  set("--tg-hint", p.hint_color);
  set("--tg-link", p.link_color);
  set("--tg-button", p.button_color);
  set("--tg-button-text", p.button_text_color);
  document.documentElement.dataset.tgScheme = webApp.colorScheme;
}

/**
 * Нативная кнопка «назад» Telegram.
 *
 * Крестик закрытия приложения превращается в стрелку, пока задан обработчик,
 * и возвращается, когда его нет. То же самое делает системная кнопка «назад»
 * на Android: пока стрелка показана, она идёт по экранам приложения, а не
 * закрывает его, — и это, пожалуй, важнее самой стрелки.
 *
 * `null` вместо обработчика прячет кнопку. Одно место владеет ею целиком
 * (app/tg/page.tsx): будь владельцев двое, они бы затирали друг друга в
 * зависимости от порядка эффектов, и стрелка оставалась бы после ухода с
 * экрана, который её показал.
 */
export function useBackButton(onBack: (() => void) | null): void {
  const handlerRef = useRef(onBack);
  useEffect(() => { handlerRef.current = onBack; });

  // Кнопка появляется и исчезает, а её поведение меняется через ref: иначе
  // подписка пересоздавалась бы на каждую перерисовку родителя.
  const visible = onBack !== null;
  useEffect(() => {
    const button = getWebApp()?.BackButton;
    if (!button) return;
    if (!visible) { button.hide(); return; }
    // Обработчик постоянный, а вызывает он всегда свежий из ref: иначе
    // переподписка происходила бы на каждую перерисовку родителя.
    const handle = () => handlerRef.current?.();
    button.onClick(handle);
    button.show();
    return () => {
      button.offClick(handle);
      button.hide();
    };
  }, [visible]);
}

/** Управление нативной главной кнопкой Telegram. */
export function useMainButtonApi() {
  return {
    show(text: string, onClick: () => void): () => void {
      const webApp = getWebApp();
      if (!webApp) return () => {};
      const button = webApp.MainButton;
      button.setText(text);
      button.onClick(onClick);
      button.show();
      return () => {
        button.offClick(onClick);
        button.hide();
      };
    },
  };
}
