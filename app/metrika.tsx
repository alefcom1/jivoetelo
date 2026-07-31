import Script from "next/script";

/**
 * Счётчик Яндекс.Метрики.
 *
 * Официальный сниппет вставлен как есть, без переписывания: внутри у него
 * своя защита от повторной вставки и свой порядок инициализации, а любая
 * «улучшенная» версия рискует разойтись с тем, что ждёт панель Метрики.
 *
 * `afterInteractive` — счётчик не должен задерживать первый экран; статистика
 * от загрузки на секунду позже не пострадает.
 *
 * В разработке счётчик не подключается: иначе локальные прогоны `next dev` и
 * e2e-тесты уходили бы в ту же статистику, что и живые посетители, и цифры
 * посещаемости пришлось бы держать в уме с поправкой.
 */

const COUNTER_ID = 111149990;

const SNIPPET = `
(function(m,e,t,r,i,k,a){
    m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();
    for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
    k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}', 'ym');

ym(${COUNTER_ID}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});

// Номер счётчика для reachGoal (lib/goals.ts). Иначе его пришлось бы
// дублировать константой в другом файле — и однажды они разойдутся.
window.__ymCounterId = ${COUNTER_ID};
`;

export function YandexMetrika() {
  if (process.env.NODE_ENV !== "production") return null;

  return <>
    <Script id="yandex-metrika" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: SNIPPET }} />
    <noscript>
      {/* Пиксель для браузеров без JS. next/image здесь неуместен: это не
          картинка, а запрос к счётчику, и оптимизировать в нём нечего. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div><img src={`https://mc.yandex.ru/watch/${COUNTER_ID}`} style={{ position: "absolute", left: "-9999px" }} alt="" /></div>
    </noscript>
  </>;
}
