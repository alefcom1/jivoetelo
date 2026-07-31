#!/usr/bin/env node
/**
 * Собирает QR-коды ссылок на бота.
 *
 *   node scripts/qr.mjs
 *
 * ## Почему при сборке, а не в рантайме
 *
 * Адрес бота не меняется, значит кодировать его заново на каждый запрос
 * незачем. Генератор живёт в репозитории, результат коммитится как SVG, а у
 * приложения нет ни одной зависимости ради QR. Тот же приём, что в
 * scripts/bot-image.mjs.
 *
 * SVG, а не PNG: код состоит из прямоугольников, вектор весит меньше растра
 * и остаётся резким на любом экране, включая печать.
 *
 * ## Уровень коррекции
 *
 * `M` (около 15% восстановления). Выше брать незачем: код короткий, а чем
 * выше уровень, тем плотнее сетка и тем хуже он читается с экрана телефона
 * под углом. Ниже — уже рискованно при бликах.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import QRCode from "qrcode";
import { botLink, START_PAYLOADS } from "../lib/bot-public.ts";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "public/qr");

/** Цвета фирменные: чернильный по бумажному, а не чёрный по белому. */
const COLORS = { dark: "#171917ff", light: "#f4f1eaff" };

const TARGETS = [
  { file: "bot.svg", url: botLink() },
  { file: "bot-plan.svg", url: botLink(START_PAYLOADS.plan) },
  { file: "bot-web.svg", url: botLink(START_PAYLOADS.web) },
];

await mkdir(outDir, { recursive: true });

for (const target of TARGETS) {
  const svg = await QRCode.toString(target.url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: COLORS,
  });
  await writeFile(resolve(outDir, target.file), svg, "utf8");
  console.log(`  ok   public/qr/${target.file} → ${target.url}`);
}
