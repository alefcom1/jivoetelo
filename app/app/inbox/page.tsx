import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu, localToday } from "@/lib/dates";
import { listPending } from "@/lib/inbox";
import { pluralRu, withPluralRu } from "@/lib/plural";
import { dismissFromInbox } from "../inbox-actions";

export const metadata: Metadata = { title: "Инбокс — Живое Тело" };

/**
 * Фото, присланные боту и ещё не ставшие приёмами пищи. Экран сознательно
 * простой: список и два действия. Разбор происходит в том же потоке, что и
 * обычное добавление, — второго интерфейса для одного и того же нет.
 */
export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = await listPending(user.id);
  const today = localToday();

  if (items.length === 0) {
    return <main className="inbox">
      <h1>Инбокс пуст</h1>
      <p className="inbox-empty">
        Сюда попадает то, что вы присылаете боту в Telegram: фото еды и голосовые. Снять или сказать можно
        в любой момент — разобрать потом, когда будет минута.
      </p>
      <p><Link className="link-button" href="/app/settings">Привязать Telegram →</Link></p>
    </main>;
  }

  return <main className="inbox">
    <h1>Инбокс</h1>
    {/* «Записей», а не «снимков»: в инбоксе теперь и расшифрованные
        голосовые, и называть их снимками — врать в самой заметной строке. */}
    <p className="inbox-count">
      {withPluralRu(items.length, ["запись", "записи", "записей"])}{" "}
      {pluralRu(items.length, ["ждёт", "ждут", "ждут"])} разбора.
    </p>

    <ul className="inbox-list">
      {items.map((item) =>
        <li className="inbox-item" key={item.id}>
          {/* next/image здесь не нужен: файл отдаётся своим же обработчиком
              с проверкой владельца, а оптимизация в 200 пикселей превью
              стоила бы больше, чем экономит. У записи голосом файла нет —
              вместо превью значок, иначе строка разъедется. */}
          {item.photoKey
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/api/photos/${item.photoKey}`} alt="" />
            : <span className="inbox-voice" aria-label="Запись голосом">🎤</span>}
          <div className="inbox-item-body">
            <p className="inbox-when">
              {item.takenOn === today ? "Сегодня" : formatDayRu(item.takenOn)}, {item.takenTime}
            </p>
            {item.note && <p className="inbox-note">«{item.note}»</p>}
            <div className="inbox-item-actions">
              <Link className="black-button" href={`/app/add?inbox=${item.id}`}>Разобрать</Link>
              <form action={dismissFromInbox}>
                <input type="hidden" name="id" value={item.id} />
                <button className="link-button" type="submit">Отклонить</button>
              </form>
            </div>
          </div>
        </li>)}
    </ul>

    <p className="inbox-note-foot">
      «Отклонить» удаляет запись: снимок стирается с сервера, расшифровка — из базы. Разобранное остаётся вместе с приёмом пищи.
    </p>
  </main>;
}
