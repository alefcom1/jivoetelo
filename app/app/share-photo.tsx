"use client";

// Отправка снимка из дневника в публичный каталог.
//
// Блок свёрнут по умолчанию и не бросается в глаза: это не то действие,
// которое человек пришёл совершить, и подталкивать к публикации собственного
// рациона было бы навязчиво. Разворачивается по нажатию, и только тогда
// появляется галочка согласия.
//
// Галочка не проставлена заранее и не может быть — согласие на публикацию
// должно быть активным действием, а предзаполненный чекбокс им не является.

import { useState } from "react";
import { sharePhotoToCatalog } from "./catalog-photo-actions";

export type ShareCandidate = { slug: string; name: string; grams: number };

export function SharePhoto({ mealId, candidates }: { mealId: number; candidates: ShareCandidate[] }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(candidates[0]?.slug ?? "");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  if (state === "sent") {
    return <p className="field-note share-photo-done">
      Снимок отправлен на проверку. Он появится в каталоге, если на нём нет ничего лишнего —
      людей за столом, документов, чужих лиц. Отозвать согласие можно в настройках.
    </p>;
  }

  if (!open) {
    return <button type="button" className="link-button" onClick={() => setOpen(true)}>
      Поделиться снимком в каталоге продуктов
    </button>;
  }

  const chosen = candidates.find((candidate) => candidate.slug === slug);

  async function submit(formData: FormData) {
    setError(null);
    setState("sending");
    const result = await sharePhotoToCatalog(formData);
    if (result.ok) setState("sent");
    else {
      setError(result.error);
      setState("idle");
    }
  }

  return <form className="share-photo" action={submit}>
    <h3>Поделиться снимком</h3>
    <p className="field-note">
      Снимок попадёт на публичную страницу продукта — её видит кто угодно, без входа.
      Так люди видят, как выглядит настоящая порция, а не студийная фотография.
    </p>

    <input type="hidden" name="mealId" value={mealId} />
    <input type="hidden" name="grams" value={chosen?.grams ?? ""} />

    <label className="field">
      На снимке
      <select name="productSlug" value={slug} onChange={(e) => setSlug(e.target.value)}>
        {candidates.map((candidate) => <option key={candidate.slug} value={candidate.slug}>
          {candidate.name} · {candidate.grams} г
        </option>)}
      </select>
    </label>

    <p className="field-note">
      Подпись под снимком: «{chosen ? `${chosen.name}, порция ${chosen.grams} г` : "—"}».
      Имени рядом не будет — только «снимок читателя».
    </p>

    {/* Перед галочкой — прямо о том, что бывает на фотографиях еды. Человек
        должен решать, зная это, а не узнать потом из опубликованного кадра. */}
    <label className="check">
      <input
        type="checkbox"
        name="consent"
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
      />
      <span>
        Согласен на публикацию этой фотографии в каталоге. Я посмотрел, что в кадр не попали
        люди, документы и другое, чего я не хотел бы показывать.
      </span>
    </label>

    {error && <p className="form-error">{error}</p>}

    <div className="button-row">
      <button type="button" className="link-button" onClick={() => setOpen(false)}>Отмена</button>
      <button className="black-button" type="submit" disabled={!consent || state === "sending"}>
        {state === "sending" ? "Отправляем…" : "Отправить на проверку"}
      </button>
    </div>
  </form>;
}
