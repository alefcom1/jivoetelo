"use client";

import { useCameraPref, type CameraPrefKey } from "./camera-prefs";

/**
 * Настройки камеры на экране настроек — одни и те же для веба и Mini App.
 *
 * Хранятся на устройстве (см. camera-prefs.ts): это настройки скорости, а не
 * вкуса, и переносить «выключено, потому что телефон старый» на ноутбук было
 * бы прямо неверно. Поэтому и подпись честно говорит, что настройка касается
 * этого устройства, а не аккаунта.
 *
 * Разметка — обычные чекбоксы теми же классами, что и остальные переключатели
 * проекта. Свой виджет-тумблер выглядел бы наряднее и стоил бы отдельной
 * доступности: роль, состояние, клавиатура. Второй набор правил ради двух
 * настроек — плохая сделка.
 */

const OPTIONS: Array<{ key: CameraPrefKey; label: string; note: string }> = [
  {
    key: "autoShot",
    label: "Снимать самому, когда кадр готов",
    note: "Приложение ждёт, пока камера замрёт и картинка станет резкой, и спускает затвор само. Кнопка съёмки работает как обычно.",
  },
  {
    key: "foodHint",
    label: "Подсказывать, попала ли еда в кадр",
    note: "Распознавание идёт на этом устройстве: при первом открытии камеры скачиваются несколько мегабайт. Выключите, если камера открывается медленно.",
  },
];

export function CameraSettings({ variant = "web" }: { variant?: "web" | "tg" }) {
  return <>
    {OPTIONS.map((option) => <CameraToggle key={option.key} option={option} variant={variant} />)}
  </>;
}

function CameraToggle({
  option,
  variant,
}: {
  option: (typeof OPTIONS)[number];
  variant: "web" | "tg";
}) {
  const [value, setValue] = useCameraPref(option.key);
  return <>
    <label className={variant === "tg" ? "tg-check" : "consent"}>
      <input type="checkbox" checked={value} onChange={(event) => setValue(event.target.checked)} />
      <span>{option.label}</span>
    </label>
    <p className={variant === "tg" ? "tg-hint" : "field-note"}>{option.note}</p>
  </>;
}
