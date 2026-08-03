"use client";

// Отзыв согласия на публикацию снимков в каталоге.
//
// Отдельной кнопкой, а не через удаление аккаунта: это единственное из наших
// согласий, без которого сервис работает полностью. Отзыв не удаляет
// фотографии из дневника — он убирает их с публичных страниц, и текст обязан
// говорить именно это, чтобы человек не ждал не того.

import { useState } from "react";
import { withdrawPhotoConsent } from "../catalog-photo-actions";

export function PhotoConsent() {
  const [busy, setBusy] = useState(false);

  return <form
    className="photo-consent"
    action={async () => {
      setBusy(true);
      await withdrawPhotoConsent();
      setBusy(false);
    }}
  >
    <p className="field-note">
      Ваши снимки могут показываться в каталоге продуктов. Отзыв убирает их с публичных
      страниц сразу — из вашего дневника фотографии никуда не денутся.
    </p>
    <button className="link-button" type="submit" disabled={busy}>
      {busy ? "Отзываем…" : "Отозвать согласие на публикацию снимков"}
    </button>
  </form>;
}
