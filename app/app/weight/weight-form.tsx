"use client";

// Ввод веса: числом или со снимка индикатора весов.
//
// Снимок не сохраняет замер сам — он подставляет число в то же поле, где вес
// набирают руками, и записывается оно той же кнопкой. Разбор этого решения —
// в lib/scale-reading.ts; коротко: ошибка в разряде десятков на семисегментном
// индикаторе выглядит как обычный вес, попадает в тренд и двигает план.

import { useActionState, useRef, useState, useTransition } from "react";
import { addWeight, scanScale, type ScaleScanState, type WeightState } from "../profile-actions";

export function WeightForm() {
  const [state, action, pending] = useActionState(addWeight, { status: "idle" } as WeightState);
  const [scan, setScan] = useState<ScaleScanState>({ status: "idle" });
  const [scanning, startScan] = useTransition();
  const [weight, setWeight] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toLocaleDateString("en-CA");

  function handleFile(file: File | null) {
    if (!file) return;
    setScan({ status: "idle" });
    const data = new FormData();
    data.set("photo", file);
    startScan(async () => {
      const result = await scanScale({ status: "idle" }, data);
      setScan(result);
      if (result.status === "read") setWeight(String(result.weightKg));
      // Сбрасываем выбор: иначе повторный снимок того же файла не вызовет
      // change, и человеку будет казаться, что кнопка перестала работать.
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return <div className="weight-entry">
    <form action={action} className="weight-form">
      <label>Дата<input name="onDate" type="date" defaultValue={today} required /></label>
      <label>Вес, кг<input
        name="weightKg" type="number" min={30} max={300} step="0.1" required
        // Значение управляемое, потому что его подставляет распознавание. В
        // поле всегда точка: число с запятой это поле молча считает
        // недействительным и показывает пустым. Запятая остаётся человеку —
        // в тексте рядом.
        value={weight} onChange={(e) => setWeight(e.target.value)}
      /></label>

      {/* Обе кнопки одной строкой: это два способа сделать одно и то же, и
          разнесённые по строкам они выглядели бы разными по важности.
          Снимок стоит вторым и в тихом начертании — числом вводят чаще. */}
      <div className="weight-actions">
        <button className="black-button" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Записать"}</button>
        {/* Свой ярлык вместо системной кнопки: браузер рисует «Choose File» на
            языке ОС, и посреди русской страницы это выглядит чужим. Сам input
            остаётся в разметке и в фокусе — прячем размером, а не display:none,
            иначе до него не добраться с клавиатуры.

            Внутри формы он безвреден: после каждого снимка выбор сбрасывается,
            и к отправке поле пусто — снимок с формой веса не уезжает. */}
        <label className="scale-scan">
          <input
            ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={scanning}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <span>{scanning ? "Читаю показания…" : "Снять показания весов"}</span>
        </label>
      </div>

      {state.status === "saved" && <span className="weight-saved">Записано.</span>}
      {state.status === "invalid" && <span className="form-error">Проверьте значение веса.</span>}
      {state.status === "error" && <span className="form-error">Не получилось сохранить.</span>}
    </form>

    <p className="field-note">
      Снимите индикатор — число подставится в поле, и вы его подтвердите. Дисплей может быть повёрнут
      как угодно. Сам снимок нигде не сохраняется.
    </p>
    {scan.status === "failed" && <p className="scale-warning">{scan.message}</p>}
    {scan.status === "read" && <p className={scan.warning ? "scale-warning" : "scale-read"}>
      {scan.warning ?? `Прочитала ${String(scan.weightKg).replace(".", ",")} кг — проверьте и запишите.`}
    </p>}
  </div>;
}
