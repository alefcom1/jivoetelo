"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Настройки камеры — на устройстве, а не в профиле.
 *
 * ## Почему не в базе
 *
 * Это настройки скорости, а не вкуса. Распознавание еды в кадре тянет
 * несколько мегабайт модели и считает её на процессоре телефона: на новом
 * аппарате это незаметно, на старом — заметно. Значение «выключить, чтобы
 * не тормозило» относится к конкретному устройству, и синхронизировать его
 * между телефоном и ноутбуком было бы прямо неверно: выключив на старом
 * телефоне, человек потерял бы подсказку на ноутбуке, где она бесплатна.
 *
 * ## Почему хук, а не просто чтение
 *
 * Значение читается только в браузере: на сервере localStorage нет, и чтение
 * при отрисовке разошлось бы с гидратацией. Поэтому первый проход всегда
 * отдаёт умолчание, а настоящее значение приезжает эффектом сразу следом.
 */

const KEYS = {
  /** Автоспуск по стабильности кадра. Ничего не грузит, считается на месте. */
  autoShot: "jt.camera.autoShot",
  /** Распознавание еды в кадре. Именно оно тянет модель. */
  foodHint: "jt.camera.foodHint",
} as const;

export type CameraPrefKey = keyof typeof KEYS;

/**
 * Умолчания. Разные, и это главное решение в этом файле.
 *
 * **Автоспуск — включён.** Он считается на месте по кадру, который и так
 * идёт в видоискатель: ни байта трафика, ни миллисекунды ожидания.
 *
 * **Распознавание еды — выключено.** Оно тянет около шести с половиной
 * мегабайт при первом открытии «Камеры», и тянет их ровно тогда, когда
 * человек собирается отправить снимок на разбор. На мобильном интернете эти
 * два дела делят один канал, и проигрывает то, ради чего человек пришёл.
 *
 * Зелёная рамка — приятное дополнение, а разбор еды — сам продукт. Списывать
 * секунды со второго ради первого нельзя, тем более без спроса. Кому рамка
 * нужна, включит её в настройках; там же сказано, чего это стоит.
 */
const DEFAULTS: Record<CameraPrefKey, boolean> = {
  autoShot: true,
  foodHint: false,
};

function read(key: CameraPrefKey): boolean {
  try {
    const stored = window.localStorage.getItem(KEYS[key]);
    if (stored === "on") return true;
    if (stored === "off") return false;
    return DEFAULTS[key];
  } catch {
    return DEFAULTS[key];
  }
}

function write(key: CameraPrefKey, value: boolean): void {
  try {
    window.localStorage.setItem(KEYS[key], value ? "on" : "off");
    // Сообщаем своей же вкладке: событие storage браузер шлёт только другим.
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  } catch {
    // Приватный режим: настройка не переживёт перезаход, но экран работает.
  }
}

const EVENT = "jt:camera-prefs";

export function useCameraPref(key: CameraPrefKey): [boolean, (value: boolean) => void] {
  // Первый проход всегда отдаёт умолчание: на сервере localStorage нет, и
  // чтение при отрисовке разошлось бы с гидратацией. Настоящее значение
  // приезжает эффектом сразу следом.
  const [value, setValue] = useState(DEFAULTS[key]);

  useEffect(() => {
    const sync = () => setValue(read(key));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key]);

  const set = useCallback((next: boolean) => {
    write(key, next);
    setValue(next);
  }, [key]);

  return [value, set];
}
