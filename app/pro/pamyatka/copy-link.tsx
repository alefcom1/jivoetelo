"use client";

// Кнопка «скопировать ссылку» для специалиста.
//
// Адрес берётся из `location`, а не пишется строкой: страница живёт и на
// боевом домене, и в предпросмотре, и захардкоженный адрес однажды уехал бы
// клиенту с чужого хоста.

import { useState } from "react";

export function CopyLink() {
  const [copied, setCopied] = useState(false);

  return <button
    className="black-button"
    type="button"
    onClick={async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        // Буфер недоступен — не беда: адрес виден в строке браузера, и
        // сообщать тут не о чем.
      }
    }}
  >
    {copied ? "Скопировано" : "Скопировать ссылку на памятку"}
  </button>;
}
