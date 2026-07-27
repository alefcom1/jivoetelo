"use client";

import { useState } from "react";

const meals = [
  { time: "08:40", title: "Завтрак", detail: "Овсянка · ягоды · йогурт", energy: "412 ккал", mark: "morning" },
  { time: "13:10", title: "Обед", detail: "Тёплый боул с лососем", energy: "586 ккал", mark: "lunch" },
  { time: "19:30", title: "Ужин", detail: "Пока не выбран", energy: "Ваш следующий шаг", mark: "dinner" },
];

export default function Home() {
  const [view, setView] = useState<"day" | "week">("day");
  const [planOpen, setPlanOpen] = useState(false);

  return (
    <main>
      <section className="hero" id="home">
        <nav className="nav shell" aria-label="Основная навигация">
          <a className="brand" href="#home" aria-label="Живое Тело — на главную">
            <span className="brand-mark">Ж</span>
            <span>Живое Тело</span>
          </a>
          <div className="nav-links">
            <a href="#principle">Как это работает</a>
            <a href="#for-pro">Для специалистов</a>
            <a href="#about">О продукте</a>
          </div>
          <button className="nav-cta" onClick={() => setPlanOpen(true)}>Попробовать</button>
        </nav>

        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><span /> Питание, которое слышит вас</p>
            <h1>Не считайте жизнь.<br /><em>Чувствуйте её ритм.</em></h1>
            <p className="hero-text">
              Живое Тело бережно соединяет еду, привычки и самочувствие — чтобы вы всегда знали, что поддержит вас сегодня.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => setPlanOpen(true)}>Создать мой ритм <b>↗</b></button>
              <a className="quiet-link" href="#principle">Посмотреть, как работает <span>↓</span></a>
            </div>
            <div className="proof">
              <div className="faces" aria-hidden="true"><i /><i /><i /><i /></div>
              <p><strong>7 400+</strong><br />человек уже выбирают себя</p>
            </div>
          </div>

          <div className="hero-visual" aria-label="Предварительный вид личного плана питания">
            <div className="orb orb-one" /><div className="orb orb-two" />
            <div className="editorial-note">Всё начинается<br />с внимания к себе <span>↘</span></div>
            <div className="dashboard-card">
              <div className="card-top"><span className="mini-logo">Ж</span><span>сегодня, 18 июня</span><button aria-label="Открыть меню">•••</button></div>
              <div className="welcome-row"><div><p>Добрый вечер, Марина</p><h2>Ваш день<br />в балансе.</h2></div><div className="sun" /></div>
              <div className="balance-panel">
                <div className="balance-copy"><span>Осталось на сегодня</span><b>742 <small>ккал</small></b><p>Ваш темп прекрасен</p></div>
                <div className="ring"><div><b>68</b><span>%</span></div></div>
              </div>
              <div className="macro-row"><span><i className="protein" />Белки <b>67г</b></span><span><i className="fat" />Жиры <b>38г</b></span><span><i className="carbs" />Углеводы <b>121г</b></span></div>
              <div className="next-meal"><div><span>Следующий приём пищи</span><b>Соберём лёгкий ужин?</b></div><button onClick={() => setPlanOpen(true)} aria-label="Подобрать ужин">→</button></div>
            </div>
          </div>
        </div>
        <div className="ticker"><span>еда — это забота</span><i /> <span>тело меняется каждый день</span><i /> <span>никакой вины</span><i /> <span>ваш собственный ритм</span></div>
      </section>

      <section className="principle shell" id="principle">
        <div className="section-heading"><p className="eyebrow"><span /> Принцип</p><h2>Данные без давления.<br /><em>Подсказки с заботой.</em></h2></div>
        <p className="section-lead">Не ещё один счётчик. Личная система, которая замечает контекст и помогает сделать маленький, подходящий именно вам шаг.</p>
        <div className="feature-grid">
          <article className="feature-card feature-dark"><span className="number">01</span><h3>Еда —<br />без рутины</h3><p>Сфотографируйте блюдо. Мы честно оценим порцию и спросим только то, что действительно важно.</p><div className="food-object"><span className="plate"><i /><b /></span><small>распознано<br /><b>92%</b></small></div></article>
          <article className="feature-card feature-sage"><span className="number">02</span><h3>План, который<br />живёт вместе с вами</h3><p>Цели меняются вслед за вашим сном, нагрузкой и настоящей динамикой — не за усреднённой таблицей.</p><div className="line-art"><span /><span /><span /><b>Сегодня</b></div></article>
          <article className="feature-card feature-coral"><span className="number">03</span><h3>Никаких<br />«идеальных» дней</h3><p>Питание — тренд, а не экзамен. Один поздний ужин не отменяет вашу заботу о себе.</p><div className="quote-mark">“</div></article>
        </div>
      </section>

      <section className="ritual" id="about">
        <div className="shell ritual-grid">
          <div className="ritual-copy"><p className="eyebrow"><span /> Ваш ритм</p><h2>Один взгляд —<br /><em>и вы уже знаете,</em><br />что делать дальше.</h2><p>Каждая цифра здесь превращается в спокойное, человеческое решение. Без запретов, стресса и тяжёлой аналитики.</p></div>
          <div className="phone-shell">
            <div className="phone-notch" />
            <div className="phone-content"><div className="phone-header"><span>9:41</span><b>Ж</b><span>◒</span></div><p className="phone-label">СР, 18 ИЮНЯ</p><h3>Ваш сегодняшний<br />ритм</h3><div className="segmented"><button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>День</button><button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Неделя</button></div><div className="phone-chart"><svg viewBox="0 0 320 120" role="img" aria-label="График баланса за день"><path d="M5 95 C40 95,50 69,77 72 S115 103,143 70 S180 44,208 62 S251 90,282 29 S302 29,315 37" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M5 95 C40 95,50 69,77 72 S115 103,143 70 S180 44,208 62 S251 90,282 29 S302 29,315 37 L315 120 L5 120Z" fill="currentColor" opacity=".09"/></svg><div className="chart-caption"><span>{view === "day" ? "Ваше самочувствие стабильно" : "Мягкий рост за последние 7 дней"}</span><b>↗</b></div></div><div className="meal-list">{meals.map((meal) => <div className="meal" key={meal.title}><time>{meal.time}</time><span className={`meal-dot ${meal.mark}`} /><div><b>{meal.title}</b><small>{meal.detail}</small></div><strong>{meal.energy}</strong></div>)}</div><button className="add-meal" onClick={() => setPlanOpen(true)}><span>+</span> Добавить приём пищи</button></div>
          </div>
        </div>
      </section>

      <section className="pro-section shell" id="for-pro">
        <div className="pro-card"><div className="pro-copy"><p className="eyebrow"><span /> Для специалистов</p><h2>Видеть человека,<br /><em>а не только таблицу.</em></h2><p>Живое Тело Pro объединяет питание, прогресс и коммуникацию с клиентами в одной красивой и ясной системе.</p><button className="light-button" onClick={() => setPlanOpen(true)}>Узнать о Pro <b>↗</b></button></div><div className="pro-preview"><div className="pro-window"><div className="pro-window-top"><i /><i /><i /><span>Обзор клиентов</span></div><div className="client-mini"><div className="avatar a1" /><div><b>Анна Власова</b><small>В фокусе: регулярность</small></div><em>+12%</em></div><div className="client-mini"><div className="avatar a2" /><div><b>Мария Соловьёва</b><small>В фокусе: белок</small></div><em>+8%</em></div><div className="client-mini"><div className="avatar a3" /><div><b>Полина К.</b><small>В фокусе: сон</small></div><em>+5%</em></div></div></div></div>
      </section>

      <footer className="footer shell"><a className="brand" href="#home"><span className="brand-mark">Ж</span><span>Живое Тело</span></a><p>Питание в ритме вашего тела.</p><button onClick={() => setPlanOpen(true)}>Начать путь <b>↗</b></button></footer>

      {planOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={() => setPlanOpen(false)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setPlanOpen(false)} aria-label="Закрыть">×</button><span className="mini-logo">Ж</span><h2 id="modal-title">Ваш ритм начинается здесь.</h2><p>Оставьте e-mail — мы пригласим вас в первую версию Живого Тела.</p><label>Ваш e-mail<input type="email" placeholder="you@example.com" autoFocus /></label><button className="primary-button" onClick={() => setPlanOpen(false)}>Встать в лист ожидания <b>↗</b></button></div></div>}
    </main>
  );
}
