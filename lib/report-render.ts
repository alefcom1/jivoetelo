// Отчёт в письмо и в сообщение бота.
//
// Модуль чистый: на вход — готовый отчёт (lib/report.ts) и ссылки, на выходе
// строки. Ни SMTP, ни Telegram API отсюда не видно.
//
// Два канала, один текст. Расходиться им нельзя: человек, у которого включены
// оба, получит одно и то же дважды и сразу увидит, что письмо и сообщение
// говорят разное. Поэтому разделы и числа берутся из одного `Report`, а
// различается только оформление.

import type { Report } from "./report.ts";

export type ReportLinks = {
  siteUrl: string;
  /** Страница настроек отчётов — она же «отписаться» для писем. */
  settingsUrl: string;
  /** Адрес для заголовка List-Unsubscribe (RFC 8058), только для писем. */
  unsubscribePostUrl?: string;
};

export type RenderedReportEmail = {
  subject: string;
  preheader: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function greeting(firstName: string | null): string {
  return firstName ? `${firstName}, вот ваш обзор.` : "Вот ваш обзор.";
}

export function renderReportEmail(
  report: Report,
  firstName: string | null,
  links: ReportLinks,
): RenderedReportEmail {
  const subject = `${report.title} — Живое Тело`;
  // Прехедер — первая строка в списке писем. Ставим туда самое ёмкое число, а
  // не «здравствуйте»: по нему видно, стоит ли открывать.
  const preheader = report.highlights.slice(0, 2).map((h) => `${h.value} ${h.label}`).join(" · ");

  const text = [
    greeting(firstName),
    report.highlights.map((h) => `${h.value} — ${h.label}`).join("\n"),
    ...report.sections.map((section) => `${section.title}\n${section.text}`),
    "—",
    `Живое Тело\n${links.siteUrl}`,
    `Отчёты можно настроить или отключить: ${links.settingsUrl}`,
  ].join("\n\n");

  const html = [
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>`,
    `<div style="max-width:600px;margin:0 auto;padding:24px;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1a17">`,
    `<p style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#8c8780">${escapeHtml(report.label)}</p>`,
    `<h1 style="margin:0 0 20px;font-size:26px;line-height:1.15;font-weight:600">${escapeHtml(greeting(firstName))}</h1>`,
    // Таблица, а не flex: в почтовых клиентах (и особенно в Outlook) сетка на
    // flex разъезжается, а таблица держится везде без исключений.
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;border-collapse:separate;border-spacing:0 8px">`,
    ...report.highlights.map((h) =>
      `<tr><td style="padding:10px 14px;background:#f4f1ea;border-radius:8px">` +
      `<strong style="font-size:20px">${escapeHtml(h.value)}</strong> ` +
      `<span style="color:#6f6a63;font-size:14px">${escapeHtml(h.label)}</span></td></tr>`,
    ),
    `</table>`,
    ...report.sections.flatMap((section) => [
      `<h2 style="margin:24px 0 6px;font-size:17px;font-weight:700">${escapeHtml(section.title)}</h2>`,
      `<p style="margin:0;color:#3a3833">${escapeHtml(section.text)}</p>`,
    ]),
    `<p style="margin:32px 0 0;color:#6f6a63">Живое Тело<br><a href="${escapeHtml(links.siteUrl)}" style="color:#6f6a63">${escapeHtml(links.siteUrl)}</a></p>`,
    `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#8c8780">Это ваш отчёт по собственному дневнику. <a href="${escapeHtml(links.settingsUrl)}" style="color:#8c8780">Настроить или отключить отчёты</a>.</p>`,
    `</div>`,
  ].join("\n");

  return { subject, preheader, text, html };
}

/**
 * Сообщение бота. Разметка HTML — как и у всего остального, что говорит бот
 * (lib/bot/markup.ts). Telegram режет сообщения на 4096 символах, поэтому
 * длинные разделы отчёта в сообщение не влезают целиком: берём числа и первые
 * разделы, а за остальным зовём в кабинет.
 */
export const TELEGRAM_LIMIT = 3500;

export function renderReportTelegram(report: Report, links: ReportLinks): string {
  const head = `📊 <b>${escapeHtml(report.title)}</b>`;
  const numbers = report.highlights.map((h) => `${escapeHtml(h.value)} — ${escapeHtml(h.label)}`).join("\n");

  const parts = [head, numbers];
  let length = head.length + numbers.length;

  for (const section of report.sections) {
    const block = `<b>${escapeHtml(section.title)}</b>\n${escapeHtml(section.text)}`;
    if (length + block.length > TELEGRAM_LIMIT) break;
    parts.push(block);
    length += block.length;
  }

  parts.push(`<a href="${escapeHtml(links.settingsUrl)}">Настроить отчёты</a>`);
  return parts.join("\n\n");
}
