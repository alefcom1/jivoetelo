/**
 * Отправка почты. Устроена так же, как AI-провайдер: без учётных данных
 * работает заглушка, которая печатает письмо в лог вместо отправки. Это
 * даёт локальную разработку без SMTP и — что важнее — безопасный первый
 * запуск на сервере: пока переменные не заполнены, серия не разошлётся
 * случайно.
 *
 * SMTP-ящик общий с techperevod (docs/shared-infra.md). Отдельного почтового
 * сервера мы не поднимаем: доставляемость с чужого VPS всё равно была бы
 * плохой, а поддержка DKIM, SPF и репутации — это отдельная работа.
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /**
   * Адрес для заголовков List-Unsubscribe: почтовые клиенты рисуют по нему
   * собственную кнопку «Отписаться». По RFC 8058 они шлют туда POST, поэтому
   * это не та же ссылка, что стоит в тексте письма, — там страница для
   * человека, а здесь обработчик запроса.
   */
  unsubscribePostUrl?: string;
};

export type Mailer = {
  readonly kind: "smtp" | "noop";
  send(email: OutgoingEmail): Promise<void>;
};

export function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || "Живое Тело <hello@jivoetelo.ru>";
}

/**
 * Есть ли всё нужное для настоящей отправки. `EMAIL_ENABLED=false` глушит
 * отправку даже при заполненном SMTP — удобно, когда сервер уже настроен, а
 * рассылку включать ещё рано.
 */
export function isEmailConfigured(): boolean {
  if (process.env.EMAIL_ENABLED === "false") return false;
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function buildHeaders(email: OutgoingEmail): Record<string, string> {
  if (!email.unsubscribePostUrl) return {};
  return {
    "List-Unsubscribe": `<${email.unsubscribePostUrl}>`,
    // Разрешает почтовому клиенту отписать в один клик, без открытия
    // страницы: он делает POST на тот же адрес.
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    // Сюда попадаем только после isEmailConfigured(), но значения всё равно
    // сводим к строкам: типы окружения ничего не гарантируют.
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "",
      port,
      // 465 — SMTPS с шифрованием с первого байта, 587 — STARTTLS.
      secure: port === 465,
      auth: { user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASSWORD ?? "" },
      // Пул соединений (pool: true) держал бы сокет открытым между письмами.
      // При нашем темпе — единицы писем в минуту — это только память на VPS,
      // поэтому оставляем поведение по умолчанию: соединение на письмо.
    });
  }
  return transporter;
}

const noopMailer: Mailer = {
  kind: "noop",
  async send(email) {
    console.info(`[mail:noop] → ${email.to} · ${email.subject}`);
    // Тело печатаем целиком. Без него письмо со ссылкой смены пароля,
    // отправленное на ненастроенной почте, исчезает бесследно — а именно
    // этот сценарий и нужен, пока SMTP не подключён: ссылку берут из лога.
    if (email.text) console.info(email.text.split("\n").map((line) => `[mail:noop] │ ${line}`).join("\n"));
  },
};

export function getMailer(): Mailer {
  if (!isEmailConfigured()) return noopMailer;

  return {
    kind: "smtp",
    async send(email) {
      await getTransporter().sendMail({
        from: emailFrom(),
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: buildHeaders(email),
      });
    },
  };
}
