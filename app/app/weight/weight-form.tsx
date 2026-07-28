"use client";

import { useActionState } from "react";
import { addWeight, type WeightState } from "../profile-actions";

export function WeightForm() {
  const [state, action, pending] = useActionState(addWeight, { status: "idle" } as WeightState);
  const today = new Date().toLocaleDateString("en-CA");

  return <form action={action} className="weight-form">
    <label>Дата<input name="onDate" type="date" defaultValue={today} required /></label>
    <label>Вес, кг<input name="weightKg" type="number" min={30} max={300} step="0.1" required /></label>
    <button className="black-button" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Записать"}</button>
    {state.status === "saved" && <span className="weight-saved">Записано.</span>}
    {state.status === "invalid" && <span className="form-error">Проверьте значение веса.</span>}
    {state.status === "error" && <span className="form-error">Не получилось сохранить.</span>}
  </form>;
}
