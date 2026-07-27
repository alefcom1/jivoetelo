# Живое Тело / jivoetelo.ru  
## Product, UX/UI and technical specification for Codex

> **Document status:** master specification for product design and phased development  
> **Primary launch platform:** responsive SaaS website / PWA  
> **Second platform:** Telegram Mini App  
> **Working product name:** **Живое Тело**  
> **Domain:** `https://jivoetelo.ru`  
> **Primary language at launch:** Russian  
> **Future languages:** English, Italian  
> **Core positioning:** an intelligent nutrition navigator that not only records food, but helps the user decide what to eat next

---

# 0. Instructions for Codex

This document is the main source of truth for the project.

Before writing production code:

1. Inspect the current repository and do not delete or overwrite unrelated files.
2. Create a short implementation plan in `docs/implementation-plan.md`.
3. Split the work into clear milestones and atomic commits.
4. Build the design system and reusable UI components before assembling pages.
5. Use real layouts, states and interactions. Do not fill the project with generic dashboard templates.
6. Do not use random gradients, generic stock illustrations, emojis as interface icons, or inconsistent component styles.
7. Every screen must have:
   - desktop state;
   - tablet state;
   - mobile state;
   - empty state;
   - loading state;
   - error state;
   - partially completed state, when relevant.
8. All form data must be validated on both client and server.
9. Every destructive or sensitive action must require explicit confirmation.
10. All environment-specific secrets must be read from environment variables.
11. Add tests for the main user flows.
12. Run linting, type checking, unit tests and production build before declaring a milestone complete.
13. Take screenshots of the key pages at desktop and mobile breakpoints and place them in `docs/screenshots/`.
14. Create demo seed data so the product looks complete immediately after local installation.
15. If a current package or framework version differs from this document, use the latest stable version compatible with the architecture and document the decision.

---

# 1. Product concept

## 1.1. The problem

Most calorie trackers are built around a backward-looking workflow:

1. The user eats.
2. The user manually records the meal.
3. The product reports how many calories have already been consumed.
4. The user is left alone to decide what to do next.

The product must move from passive accounting to active guidance.

Живое Тело should answer four questions:

1. **What did I eat?**
2. **How accurate is this estimate?**
3. **How is my body and progress responding?**
4. **What is the best next action or meal for me today?**

## 1.2. Core promise

> **Log your food in seconds. Understand the estimate. Know what to eat next.**

Russian variant:

> **Записывайте еду за секунды. Получайте честную оценку. Знайте, что съесть дальше.**

## 1.3. Strategic product definition

Живое Тело is not merely a calorie counter.

It is a combination of:

- food diary;
- adaptive calorie and macro coach;
- AI meal recognition assistant;
- meal planning system;
- nutrition quality dashboard;
- habit and wellbeing tracker;
- professional SaaS for nutritionists and coaches;
- future Telegram companion;
- future API and MCP layer for personal AI agents.

## 1.4. Product principles

The system must be:

- **fast** — adding a meal should usually take less than 10 seconds;
- **honest** — AI estimates must show uncertainty and ask for clarification when needed;
- **adaptive** — calorie and macro targets should evolve from actual progress;
- **non-judgmental** — no shame, punishment, aggressive red screens or “failed day” mechanics;
- **beautiful** — visual quality must be a primary product feature, not decoration added at the end;
- **actionable** — every analytical insight should end with a useful next step;
- **safe** — the service must not diagnose disease or encourage extreme restriction;
- **professional** — data, terminology, privacy and reports should be credible enough for specialists;
- **local** — strong support for Russian products, brands, dishes and measurements;
- **extensible** — web, PWA, professional dashboard and Telegram Mini App must use one backend and one design system.

---

# 2. Brand architecture and naming

## 2.1. Approved visible product name

The approved public product name is **Живое Тело**.

The name communicates the core product idea: nutrition should support a living, changing body rather than force it to conform to a static formula. It is emotionally warm, human and aligned with the service’s non-judgmental positioning.

The domain `jivoetelo.ru` directly supports the brand and must be used consistently in public communications.

## 2.2. Brand usage

Use **Живое Тело** as the master brand in product interfaces, marketing materials, documentation and user communications.

Advantages:

- directly connected to the domain;
- clear and memorable for the Russian-speaking audience;
- emotionally aligned with the product promise;
- broad enough for consumer, professional and family product lines;
- does not lock the service into weight loss only.

For technical identifiers that cannot contain Cyrillic or spaces, use `jivoetelo`.

## 2.3. Product family

Use one master brand:

- **Живое Тело** — consumer nutrition platform;
- **Живое Тело Pro** — specialist SaaS;
- **Живое Тело Family** — family meal planning;
- **Живое Тело for Teams** — corporate wellness;
- **Живое Тело AI** — conversational food and planning assistant;
- **Живое Тело Mini** — Telegram Mini App, only as an internal working title;
- **Живое Тело API** — future integrations.

Do not create separate unrelated brands for each module.

## 2.4. Legal and availability checks

Before public launch, confirm the availability and permitted use of **Живое Тело** through:

- trademark search;
- company-name search;
- App Store and Google Play name search;
- social handle search;
- legal review in the intended countries.

## 2.5. Recommended slogan system

Primary:

> **Питание в ритме вашего тела.**

Functional:

> **Не просто считайте. Знайте, что делать дальше.**

AI-focused:

> **Сфотографируйте еду. Получите честную оценку. Выберите лучший следующий шаг.**

Professional:

> **Питание, прогресс и клиенты — в одной системе.**

---

# 3. Target audiences

## 3.1. Consumer user

Primary user:

- 25–50 years old;
- wants to lose weight, maintain weight or improve nutrition;
- has tried calorie counters before;
- dislikes tedious logging;
- wants useful recommendations without aggressive dieting;
- uses Telegram daily;
- may use a smartwatch or health platform;
- values attractive design and emotional comfort.

Secondary users:

- people gaining muscle;
- users maintaining weight;
- people focused on protein, fibre or meal quality;
- families planning shared meals;
- users working with a nutritionist or trainer;
- users who want to improve eating patterns without seeing calorie numbers prominently.

## 3.2. Professional user

- nutritionist;
- dietitian;
- fitness trainer;
- health coach;
- wellness specialist;
- online weight-management school;
- fitness club;
- clinic or sanatorium;
- corporate wellness manager.

## 3.3. Admin and content team

- system administrator;
- food database moderator;
- nutrition expert;
- support manager;
- content editor;
- billing manager;
- analytics manager.

---

# 4. Product boundaries and safety

## 4.1. The service is not a medical product at MVP

The service:

- does not diagnose diseases;
- does not prescribe treatment;
- does not replace a doctor or registered dietitian;
- does not guarantee weight outcomes;
- does not provide emergency or crisis support;
- does not create extreme calorie targets;
- does not encourage purging, compensatory exercise or prolonged fasting.

## 4.2. Safety rules

Implement minimum safeguards:

- hard lower boundaries for automated calorie recommendations;
- warning and manual review for rapid weight-loss goals;
- age restriction for independent calorie-target use;
- pregnancy and breastfeeding require a special safe mode and specialist recommendation;
- minors must not receive weight-loss targets without a guardian and specialist flow;
- no celebratory messages for extreme deficits;
- no “burn off your meal” messaging;
- no red punishment state after exceeding a target;
- no streak loss designed to provoke guilt;
- allow the user to hide calories and focus on habits;
- show crisis and specialist guidance if the user enters alarming food-related behaviour patterns.

## 4.3. Language rules

Preferred:

- “Сегодня получилось больше плана.”
- “Ничего компенсировать не нужно.”
- “Вернитесь к обычному ритму завтра.”
- “Оценка приблизительная.”
- “Уточните способ приготовления.”
- “Ваш тренд меняется быстрее запланированного.”

Forbidden:

- “Вы сорвались.”
- “Плохая еда.”
- “Запрещённый продукт.”
- “Вы провалили день.”
- “Сожгите лишние калории.”
- “Отработайте десерт.”
- “У вас нет силы воли.”

---

# 5. Release strategy

## Phase 1 — premium public website and design system

Goal:

- establish brand;
- communicate product difference;
- collect early-access registrations;
- build reusable UI;
- demonstrate the future dashboard with real interactive prototypes.

Deliverables:

- homepage;
- product page;
- AI meal recognition page;
- “What should I eat now?” page;
- professionals page;
- pricing page;
- science and methodology page;
- recipes / knowledge section foundation;
- authentication;
- design system;
- responsive app shell;
- waitlist and onboarding.

## Phase 2 — consumer SaaS MVP

Goal:

- complete daily food logging and progress loop.

Deliverables:

- onboarding;
- daily dashboard;
- manual food search;
- quick add;
- meal creation;
- recipes;
- barcode-ready architecture;
- photo upload and AI analysis;
- weight tracking;
- calorie and macro targets;
- progress charts;
- basic recommendations;
- subscription;
- PWA.

## Phase 3 — adaptive intelligence

Deliverables:

- adaptive TDEE estimation;
- trend weight;
- confidence scoring;
- “What should I eat now?” engine;
- weekly review;
- micronutrient insights;
- pantry and meal planning;
- voice and text meal entry;
- wearable integrations.

## Phase 4 — Живое Тело Pro

Deliverables:

- professional dashboard;
- client invitations;
- client groups;
- target management;
- food diary review;
- secure messages;
- comments on meals;
- reports;
- programs and templates;
- scheduling and payments where legally suitable;
- white-label options.

## Phase 5 — Telegram Mini App

Deliverables:

- fast daily logging;
- photo upload;
- voice meal entry;
- daily balance;
- reminders;
- “What should I eat now?”;
- status and weekly summary;
- deep links back to the full SaaS;
- Telegram login;
- Telegram Stars only where required by platform rules;
- shared backend with the website.

---

# 6. Information architecture

## 6.1. Public website

Main navigation:

- Product
- AI food camera
- How it works
- For specialists
- Recipes
- Pricing
- Science
- Sign in
- Start free

Recommended routes:

```text
/
/product
/ai-food-camera
/what-to-eat
/adaptive-plan
/pro
/pricing
/science
/recipes
/recipes/[slug]
/articles
/articles/[slug]
/about
/security
/privacy
/terms
/contact
/login
/register
```

## 6.2. Consumer SaaS

Main app navigation:

- Today
- Diary
- Plan
- Progress
- Explore
- Assistant
- Profile

Desktop sidebar:

```text
Today
Diary
Meal plan
What to eat now
Progress
Analytics
Recipes
Favourites
Pantry
Messages
Settings
```

Mobile bottom navigation:

1. Today
2. Diary
3. Add
4. Progress
5. Profile

The central **Add** action must be visually prominent and open a multimodal food-entry sheet.

## 6.3. Professional SaaS

Main navigation:

- Overview
- Clients
- Groups
- Programs
- Messages
- Reports
- Appointments
- Resources
- Billing
- Settings

## 6.4. Admin panel

Main navigation:

- Overview
- Users
- Professionals
- Organisations
- Food database
- Product moderation
- Recipes
- AI review queue
- Subscriptions
- Payments
- Support
- Content
- Feature flags
- Audit log
- System health
- Settings

---

# 7. Public website specification

# 7.1. Homepage

The homepage must not look like a generic nutrition template.

It should feel like a product launch from a premium technology and wellness company.

## Block 1 — navigation

Desktop:

- logo left;
- restrained centre navigation;
- “Sign in” text button;
- “Start free” primary button;
- translucent sticky header after scroll.

Mobile:

- logo;
- primary “Start” action;
- menu button;
- full-screen premium menu with large typography.

Header rules:

- initially transparent over hero;
- after scroll: warm translucent background, blur, subtle border;
- no heavy shadow;
- maximum width aligned with page grid.

## Block 2 — hero

Recommended copy:

### Eyebrow

**AI nutrition navigator**

### Headline

**Не просто считайте калории.  
Знайте, что съесть дальше.**

### Supporting text

**Живое Тело распознаёт еду по фото, честно показывает точность оценки, адаптируется к вашему прогрессу и помогает выбрать следующий приём пищи.**

### Primary CTA

**Начать бесплатно**

### Secondary CTA

**Посмотреть, как это работает**

### Trust note

**Без рекламы. Без наказаний. С полным контролем над данными.**

### Hero visual

Do not use a phone mockup floating over a gradient.

Create a composed product scene:

- central interactive meal card;
- real premium food photography;
- AI labels hovering over meal components;
- daily balance card;
- “What to eat next” card;
- subtle weight trend graph;
- motion showing data flowing from meal image into the daily plan.

The hero should feel alive:

- ingredient labels appear sequentially;
- confidence values softly animate;
- remaining protein and fibre update;
- suggested dinner card changes based on detected meal;
- the animation stops when reduced-motion is enabled.

## Block 3 — immediate product demonstration

Title:

**Один снимок — и вы уже знаете больше.**

Interactive before/after:

Left:

- meal photo.

Right:

- detected components;
- estimated portions;
- calories and macros;
- confidence;
- one clarification question.

Example:

```text
Лосось            142 г      96%
Картофель          184 г      88%
Овощной салат      116 г      91%
Заправка           уточнить
```

Question:

> Заправка была на масле, йогурте или майонезе?

The user can click an answer and see the estimate update.

This block must be a real interactive demo, not a static screenshot.

## Block 4 — differentiation

Headline:

**Большинство приложений показывают прошлое.  
Живое Тело помогает с будущим.**

Three premium cards:

1. **Записать за 10 секунд**
   - photo;
   - voice;
   - text;
   - barcode;
   - repeat meal.

2. **Понять точность**
   - confidence;
   - source;
   - clarification;
   - easy correction.

3. **Выбрать следующий шаг**
   - remaining macros;
   - time;
   - budget;
   - pantry;
   - personalised suggestions.

## Block 5 — “What should I eat now?”

Use a dark editorial section to create rhythm.

Headline:

**Спросите не “сколько осталось?”, а “что мне подойдёт сейчас?”**

Interactive scenario:

```text
Осталось на сегодня:
680 kcal
42 g protein
9 g fibre

У вас:
15 minutes
chicken, tomatoes, yoghurt
```

Suggested cards:

- warm chicken bowl;
- protein wrap;
- yoghurt plate;
- nearby ready-made option.

Filters:

- no cooking;
- 15 minutes;
- budget;
- restaurant;
- vegetarian;
- high protein;
- family meal.

## Block 6 — adaptive plan

Headline:

**План, который учится на вашем теле.**

Show a beautiful trend visual:

- starting estimate;
- logged intake;
- smoothed weight trend;
- adaptive expenditure range;
- weekly adjustment proposal.

Copy:

> Формулы дают стартовую точку. Живое Тело постепенно уточняет план по вашей реальной динамике, а не заставляет тело соответствовать усреднённой таблице.

Use neutral uncertainty bands, not fake precision.

## Block 7 — nutrition quality

Headline:

**Калории — только один слой.**

Show a circular or layered “day quality” composition:

- protein;
- fibre;
- hydration;
- vegetables;
- micronutrient focus;
- meal regularity.

Do not present 90 nutrients on the homepage.

Show one human insight:

> В последние семь дней вам регулярно не хватает клетчатки. Добавьте овощи к обеду или выберите один из трёх простых вариантов.

## Block 8 — emotional safety

Headline:

**Без стыда. Без красных экранов. Без “проваленных дней”.**

Visual:

- calm notification card;
- over-target day;
- product response.

Example:

> Сегодня получилось больше плана. Ничего компенсировать не нужно. Завтра продолжим в обычном ритме.

This is a key brand differentiator.

## Block 9 — progress

Headline:

**Смотрите на тренд, а не на шум.**

Visualise:

- daily weight dots;
- smoothed trend;
- waist measurement;
- energy;
- consistency;
- protein average.

Do not make weight the only success metric.

## Block 10 — professionals

Split-screen transition into Живое Тело Pro.

Headline:

**Работаете со специалистом? Он видит картину целиком.**

Features:

- food diary;
- meal photos;
- comments;
- trends;
- goals;
- reports;
- secure messages;
- weekly summary.

CTA:

**Живое Тело для специалистов**

## Block 11 — family mode teaser

Headline:

**Одно блюдо. Разные цели. Один список покупок.**

Show one family recipe divided into portions:

- maintenance;
- moderate deficit;
- active adult;
- child mode without calorie emphasis.

Mark as “coming later” if not available.

## Block 12 — pricing

Three plans:

### Free

- manual diary;
- calories and macros;
- weight trend;
- limited AI scans;
- basic insights.

### Premium

- unlimited AI logging;
- voice and text input;
- adaptive targets;
- advanced analytics;
- “What should I eat now?”;
- meal planning;
- micronutrient insights;
- no ads.

### With specialist

- all Premium features;
- specialist connection;
- shared goals;
- comments and reports;
- secure messages.

Do not show fake discounts.

## Block 13 — FAQ

Topics:

- accuracy of photo recognition;
- whether weighing food is required;
- calorie estimate methodology;
- subscriptions;
- privacy;
- health and medical limitations;
- use without showing calories;
- working with a specialist;
- Telegram Mini App timing;
- cancellation and data deletion.

## Block 14 — final CTA

Headline:

**Питание становится проще, когда следующий шаг понятен.**

Buttons:

- Start free
- Join early access

Final visual should be calm, not another dashboard collage.

---

# 7.2. Product page

Purpose:

- explain the entire consumer workflow;
- rank for product-related search queries;
- convert users who need more detail than the homepage.

Sections:

1. Product overview.
2. Multimodal logging.
3. AI confidence and corrections.
4. Daily dashboard.
5. Adaptive targets.
6. Meal planning.
7. Progress.
8. Nutrition quality.
9. Integrations.
10. Privacy.
11. Pricing CTA.

---

# 7.3. AI food camera page

Must explain:

- what AI can recognise;
- what it cannot reliably recognise;
- how confidence works;
- how the user corrects ingredients;
- how hidden oils and sauces are handled;
- why estimates are ranges;
- how feedback improves personal suggestions.

Include an interactive demo and examples:

- simple plate;
- mixed dish;
- soup;
- packaged food;
- restaurant meal;
- homemade recipe.

Do not claim medically exact or laboratory-level accuracy.

---

# 7.4. “What to eat now?” page

This is the strongest product landing page.

Inputs:

- remaining calories and macros;
- hunger;
- meal type;
- time;
- budget;
- dietary preferences;
- available ingredients;
- cooking preference;
- restaurant or home;
- desired satiety.

Outputs:

- 3–5 ranked suggestions;
- why each suggestion fits;
- portion guidance;
- substitutions;
- impact on the rest of the day;
- save to plan;
- add ingredients to shopping list.

---

# 7.5. Professionals page

Audience:

- nutritionists;
- trainers;
- health coaches;
- small clinics;
- online schools.

Hero:

**Меньше таблиц. Больше времени на клиента.**

Show:

- client list;
- flagged changes;
- diary review;
- progress summary;
- comments;
- reports.

Sections:

1. Real-time client overview.
2. Custom targets.
3. Food and mood journal.
4. Weekly AI summary.
5. Messages.
6. Programs and templates.
7. Reports.
8. White-label roadmap.
9. Pricing.
10. Professional onboarding CTA.

---

# 7.6. Science and methodology page

Must create trust without pretending the product is a medical authority.

Sections:

- how starting calorie targets are estimated;
- how activity is considered;
- why weight is shown as a trend;
- how adaptive targets work;
- how food data is sourced;
- how AI confidence is calculated;
- known limits of image recognition;
- how recommendation safety works;
- expert review process;
- references.

Use calm editorial typography and diagrams.

---

# 8. Consumer SaaS interface

# 8.1. App shell

## Desktop

- left compact sidebar;
- central content canvas;
- optional right contextual panel;
- maximum useful content width;
- no full-width empty dashboard grids;
- top bar with date, search, notifications and profile.

## Tablet

- collapsible sidebar;
- contextual panel becomes drawer;
- cards reorganise into two columns.

## Mobile

- bottom navigation;
- sticky add button;
- full-screen sheets for entry;
- swipe interactions only as enhancement, never the sole control;
- one-handed primary actions.

---

# 8.2. Onboarding

Onboarding must feel like a guided conversation, not a tax form.

Use one focused question per screen.

Steps:

1. Welcome and product promise.
2. Goal:
   - lose;
   - maintain;
   - gain;
   - eat more consistently;
   - improve nutrition quality.
3. Basic profile:
   - date of birth;
   - sex for formula use, with respectful explanation;
   - height;
   - current weight.
4. Activity pattern.
5. Desired pace.
6. Dietary preferences.
7. Allergies and exclusions.
8. Cooking availability.
9. Typical meal pattern.
10. Whether calorie numbers should be visible.
11. Optional connection to a specialist.
12. Starting plan summary.
13. Explicit consent and data controls.

Show progress without implying the user is trapped.

Allow “skip for now” where safe.

At the end show:

- starting energy range;
- protein range;
- fibre focus;
- three simple first-week actions.

Do not promise a precise goal date.

---

# 8.3. Today dashboard

The dashboard should answer:

1. What is my current state?
2. What should I do next?
3. How do I add food quickly?

## Hero card

Dynamic message:

> Доброе утро. Начнём день без сложных правил.

or:

> До ужина осталось два часа. Сегодня стоит добрать белок и клетчатку.

Content:

- daily energy balance;
- protein;
- fibre;
- water;
- next recommended action;
- quick add.

Do not make a huge calorie number the only visual focus.

## Meal timeline

Cards:

- breakfast;
- lunch;
- dinner;
- snacks.

Each card contains:

- image or elegant placeholder;
- meal name;
- time;
- calories;
- protein;
- confidence indicator if AI-generated;
- edit action.

Empty meal card:

> Добавьте фото, продиктуйте или выберите из недавних.

## Insight card

Only one primary insight at a time.

Examples:

- low protein by midday;
- low fibre over the week;
- irregular meal timing;
- better adherence on planned days;
- high hunger after low-protein breakfast.

## “Next meal” card

A single personalised action:

> Подобрать ужин на 600–700 ккал с 40 г белка.

## Daily reflection

Optional quick input:

- hunger;
- energy;
- mood;
- stress.

Use one-tap scales with descriptive labels.

---

# 8.4. Multimodal add flow

Open from central Add button.

Options:

- Take photo
- Upload photo
- Speak
- Type
- Scan barcode
- Search food
- Repeat recent meal
- Create recipe
- Quick calories

The first screen should prioritise photo and voice while retaining all methods.

## Voice input example

User:

> Два сырника, ложка сметаны и капучино без сахара.

System:

- transcribes;
- detects items;
- asks serving clarifications only when necessary;
- presents one editable confirmation card.

## Text input example

Accept natural language:

> 200 г гречки, куриная грудка, салат и чай с молоком.

## Quick add

For users who know approximate values:

- calories;
- protein;
- carbs;
- fat;
- optional note.

---

# 8.5. AI meal analysis screen

This is a flagship interface.

Layout:

- large meal image;
- ingredient overlays;
- result panel;
- confidence and source indicators;
- clarification area;
- save action.

For each detected component show:

- name;
- estimated weight;
- calories;
- macros;
- confidence;
- data source;
- edit.

Confidence levels:

- High;
- Medium;
- Needs clarification.

Do not show fake percentages unless the model returns a meaningful calibrated value. A three-level system is acceptable for MVP.

Hidden ingredient prompts:

- oil;
- dressing;
- sugar;
- sauce;
- cooking method;
- filling.

Ask no more than one or two high-impact questions before save.

After correction:

- update totals instantly;
- store the correction for personal preference;
- mark whether the user wants this combination saved as a meal.

---

# 8.6. Food search and database

Search must be extremely fast.

Ranking order:

1. recent;
2. favourites;
3. exact branded matches;
4. verified generic food;
5. user-created foods;
6. community data.

Each item must display a source badge:

- Manufacturer verified
- Expert verified
- Database source
- Recipe calculated
- User-created
- Community, unverified

Prevent duplicate clutter.

Features:

- barcode;
- brand filter;
- store filter;
- portion presets;
- raw/cooked state;
- custom portion;
- compare similar items;
- report incorrect data;
- create missing food.

---

# 8.7. Meal detail

Show:

- image;
- meal time;
- ingredients;
- calories and macros;
- selected micronutrients;
- satiety note;
- mood/hunger;
- source confidence;
- comments from specialist;
- duplicate;
- save as template;
- edit;
- delete.

Add a section:

**How this meal fits your day**

Example:

> This meal covers 36% of today’s protein target and leaves enough energy for a full dinner.

---

# 8.8. “What should I eat now?” engine

Inputs should be mostly prefilled from user data.

Context:

- time of day;
- daily remainder;
- recent meals;
- hunger;
- desired meal size;
- available time;
- pantry;
- budget;
- dietary restrictions;
- location mode;
- preferred cuisine;
- cooking level.

Result card:

- meal image;
- name;
- why it fits;
- calories;
- protein;
- fibre;
- preparation time;
- estimated cost;
- ingredients;
- substitutions;
- “Add to today”;
- “Plan for later”;
- “Show another”.

Add a transparent explanation:

> Recommended because you have 620–750 kcal remaining, protein is below target and you selected a 15-minute meal.

Do not imply clinical recommendation.

---

# 8.9. Meal planner

Views:

- day;
- week;
- flexible list.

Features:

- drag and drop;
- auto-fill;
- swap meal;
- lock favourite meals;
- family portions;
- shopping list;
- leftovers;
- batch cooking;
- restaurant meal placeholder;
- macro distribution by day.

The planner must remain usable on mobile.

Use a vertical agenda on mobile, not a compressed seven-column calendar.

---

# 8.10. Pantry

User can add:

- food;
- amount;
- expiration date;
- category;
- favourite status.

Input methods:

- manual;
- receipt photo later;
- barcode;
- imported shopping list.

Use pantry data for meal suggestions.

---

# 8.11. Progress

Top tabs:

- Overview
- Weight
- Nutrition
- Habits
- Measurements
- Wellbeing

## Overview

- trend weight;
- rate of change;
- adherence range;
- average calories;
- protein consistency;
- fibre consistency;
- energy and hunger;
- next adjustment date.

## Weight

Show:

- daily values as subtle dots;
- smoothed trend line;
- range;
- weekly change;
- target range.

Do not overreact to one-day fluctuations.

## Nutrition

- average energy;
- protein;
- fibre;
- selected nutrients;
- meal distribution;
- day-of-week pattern.

## Habits

- logging consistency;
- breakfast regularity;
- vegetables;
- water;
- sleep connection.

## Measurements

- waist;
- hips;
- chest;
- custom;
- progress photos with private protection.

## Wellbeing

- hunger;
- energy;
- mood;
- sleep;
- stress.

---

# 8.12. Weekly review

Create a premium editorial report, not a spreadsheet dump.

Sections:

1. Main result.
2. What went well.
3. What influenced progress.
4. Nutrition pattern.
5. Body response.
6. Recommended adjustment.
7. One focus for next week.

Example:

> Your weight trend is falling slightly faster than planned. Average hunger also increased in the evening. We recommend adding 100–150 kcal, mainly to lunch or afternoon snack.

Require confirmation before applying a target change.

---

# 8.13. Assistant

The assistant is a contextual interface, not a generic chatbot.

Suggested prompts:

- What should I eat for dinner?
- Why did my target change?
- Add my breakfast from yesterday.
- Plan three lunches under 20 minutes.
- Show foods rich in fibre from my favourites.
- Summarise my week.
- Prepare a question for my nutritionist.

The assistant must use actual account context only with explicit permissions.

Every generated action should show a preview before saving.

---

# 8.14. Settings and privacy

Sections:

- account;
- profile;
- goals;
- nutrition targets;
- visibility mode;
- notifications;
- connected devices;
- specialist access;
- data permissions;
- subscription;
- export;
- delete account;
- language;
- theme;
- accessibility.

Data controls:

- export all data;
- delete specific meal;
- delete photos while keeping nutrition data;
- revoke specialist access;
- revoke AI processing consent;
- close account;
- define photo retention preference.

---

# 9. Живое Тело Pro

# 9.1. Professional overview

Dashboard cards:

- active clients;
- clients needing attention;
- unread messages;
- scheduled reviews;
- recent progress changes;
- incomplete check-ins.

Attention feed examples:

- trend changed faster than target;
- no entries for seven days;
- repeated low-energy reports;
- client asked a question;
- weekly review ready;
- target requires confirmation.

Avoid “red alert” language unless a true safety condition exists.

---

# 9.2. Client list

Columns:

- client;
- goal;
- current trend;
- last entry;
- plan adherence range;
- next review;
- status;
- assigned specialist.

Filters:

- active;
- inactive;
- new;
- needs review;
- group;
- goal;
- specialist.

Mobile uses cards, not a squeezed table.

---

# 9.3. Client profile

Tabs:

- Overview
- Diary
- Progress
- Targets
- Check-ins
- Messages
- Reports
- Files
- Access log

Overview:

- trend;
- average intake;
- protein and fibre;
- wellbeing;
- adherence;
- recent meals;
- latest weekly summary;
- specialist notes.

Diary:

- timeline;
- photos;
- ingredient details;
- confidence;
- comment action.

Targets:

- energy;
- macro ranges;
- nutrient focus;
- meal structure;
- habits;
- visibility to client;
- effective date.

---

# 9.4. Programs

Specialists can create reusable programs:

- modules;
- lessons;
- tasks;
- recipes;
- check-ins;
- resources;
- scheduled release;
- group assignment.

MVP can start with simple templates and tasks.

---

# 9.5. Reports

Types:

- weekly summary;
- monthly progress;
- nutrition average;
- adherence;
- food diary;
- custom period;
- professional notes.

Export:

- PDF;
- CSV;
- shareable secure link.

Do not include sensitive information in public URLs.

---

# 9.6. White-label future

Future options:

- specialist logo;
- accent colour;
- custom domain;
- branded reports;
- branded client invitation;
- organisation-specific programs.

Do not allow full visual fragmentation. Preserve the core design system.

---

# 10. Premium design system

# 10.1. Visual concept: Warm Intelligence

The interface should combine:

- precision of a premium financial product;
- warmth of modern food editorial design;
- calmness of a wellbeing product;
- clarity of a professional analytics platform.

It must not look like:

- a gym supplement store;
- a hospital portal;
- a generic Tailwind dashboard;
- a children’s habit tracker;
- a neon AI startup;
- a green organic grocery shop.

## Emotional qualities

- calm;
- tactile;
- intelligent;
- optimistic;
- trustworthy;
- mature;
- alive.

---

# 10.2. Colour palette

Use CSS variables and semantic tokens.

```css
:root {
  --color-canvas: #F4F0E8;
  --color-surface: #FFFCF7;
  --color-surface-elevated: #FFFFFF;
  --color-ink: #171814;
  --color-ink-muted: #686A62;
  --color-line: rgba(23, 24, 20, 0.10);

  --color-primary: #2946C6;
  --color-primary-hover: #2039A8;
  --color-primary-soft: #E9EDFF;

  --color-sage: #789270;
  --color-sage-soft: #EAF0E7;

  --color-coral: #F27B63;
  --color-coral-soft: #FDEAE4;

  --color-gold: #C99B4A;
  --color-gold-soft: #F7EDD8;

  --color-info: #4971C9;
  --color-success: #557B5B;
  --color-warning: #B47B34;
  --color-danger: #B95353;
}
```

Rules:

- cobalt is the brand and action colour;
- food photography supplies most of the natural colour;
- sage supports health and calm;
- coral supports appetite and warmth;
- gold is used sparingly for premium details;
- red is reserved for true errors and safety warnings;
- exceeding a calorie target is not an error state.

Dark theme:

```css
[data-theme="dark"] {
  --color-canvas: #11120F;
  --color-surface: #191A16;
  --color-surface-elevated: #21231E;
  --color-ink: #F5F2EA;
  --color-ink-muted: #A9AA9F;
  --color-line: rgba(255, 255, 255, 0.10);
  --color-primary: #8196FF;
  --color-primary-hover: #9BABFF;
  --color-primary-soft: #252C51;
}
```

---

# 10.3. Typography

Recommended:

- UI and headings: **Onest** or another high-quality variable sans with strong Cyrillic;
- editorial accents: **Source Serif 4** or a compatible serif with Cyrillic;
- numbers: tabular numerals where alignment matters.

Rules:

- use large, confident headings;
- avoid ultra-light weights;
- body line height 1.5–1.65;
- dashboard labels remain readable;
- do not set long Russian headings in all caps;
- use sentence case;
- reserve the serif for quotes, science pages and editorial moments.

Suggested scale:

```text
Display XL: 72/76 desktop, 44/48 mobile
Display L: 56/62 desktop, 38/42 mobile
H1: 48/54 desktop, 34/40 mobile
H2: 38/44 desktop, 30/36 mobile
H3: 28/34
Body L: 18/28
Body M: 16/24
Body S: 14/20
Caption: 12/16
```

---

# 10.4. Grid and spacing

Desktop:

- max width: 1440 px;
- content width: 1240–1320 px;
- 12-column grid;
- 24 px gutters;
- section padding: 112–160 px.

Tablet:

- 8-column grid;
- 24 px side padding.

Mobile:

- 4-column grid;
- 16 px side padding;
- section padding: 72–96 px.

Spacing scale:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128
```

---

# 10.5. Shape language

- large cards: 24–32 px radius;
- standard controls: 14–18 px radius;
- chips: pill shape;
- buttons: 14–16 px radius;
- image masks: organic but restrained;
- avoid excessive circles;
- avoid glassmorphism on every card.

Glass should be used only for:

- sticky navigation;
- floating context panels;
- mobile sheets over photography;
- AI detection overlays;
- selected hero elements.

---

# 10.6. Shadows and borders

Use borders and tonal layering more than heavy shadows.

Example:

```css
--shadow-soft:
  0 1px 2px rgba(20, 20, 16, 0.04),
  0 12px 40px rgba(20, 20, 16, 0.06);

--shadow-floating:
  0 12px 32px rgba(20, 20, 16, 0.10),
  0 2px 8px rgba(20, 20, 16, 0.06);
```

No blue neon glow around standard cards.

---

# 10.7. Iconography

Requirements:

- custom or carefully selected SVG icon set;
- rounded geometric line style;
- consistent stroke width;
- optical corrections;
- separate filled state for active navigation;
- no emoji;
- no mixing multiple icon families.

Create custom icons for:

- AI camera;
- confidence;
- meal;
- protein;
- fibre;
- water;
- adaptive plan;
- trend;
- specialist;
- pantry;
- family portions.

---

# 10.8. Food photography

Photography is central to the design.

Requirements:

- natural daylight;
- tactile ingredients;
- real portions;
- modern editorial plating;
- no fitness clichés;
- no measuring tape wrapped around fruit;
- no isolated salad bowl on white;
- no fake perfect diet food;
- include familiar Russian and international meals;
- show home food, restaurant food and packaged food;
- consistent warm-neutral colour grading.

Image ratios:

- meal card: 4:3;
- recipe card: 3:2;
- hero composition: flexible layered;
- mobile story: 9:16;
- article: 16:9.

---

# 10.9. Data visualisation

Charts must feel calm and understandable.

Rules:

- prioritise trend and range;
- avoid rainbow charts;
- never rely on colour alone;
- label important points directly;
- provide accessible text summary;
- animate only on first appearance;
- show uncertainty bands where appropriate;
- explain metric definitions;
- allow daily, weekly and monthly views.

Recommended charts:

- smoothed weight trend;
- intake range;
- macro distribution;
- weekday pattern;
- hunger/energy relationship;
- nutrient consistency;
- habit calendar.

Do not use a giant doughnut chart as the only daily summary.

---

# 10.10. Motion

Motion should explain state changes.

Use:

- 180–260 ms for controls;
- 300–500 ms for panels;
- spring motion for draggable meal cards;
- number interpolation for totals;
- subtle image-to-data transition in AI analysis;
- staggered ingredient detection;
- soft chart drawing.

Avoid:

- constant floating;
- particles everywhere;
- spinning gradients;
- long entrance animations;
- scroll hijacking.

Respect `prefers-reduced-motion`.

---

# 10.11. Sound and haptics

Web:

- no sound by default.

Telegram/mobile later:

- optional subtle haptic for successful save;
- optional haptic for scan completion;
- no reward casino sounds.

---

# 10.12. Accessibility

Target WCAG 2.2 AA.

Requirements:

- keyboard navigation;
- visible focus;
- correct labels;
- screen-reader summaries for charts;
- minimum touch target 44×44;
- sufficient contrast;
- reduced motion;
- colour-blind-safe states;
- text zoom support;
- form errors connected to fields;
- no critical information only on hover.

---

# 11. Core components

Build a reusable component library.

## Navigation

- PublicHeader
- AppSidebar
- MobileBottomNav
- ContextTopBar
- Breadcrumbs
- CommandMenu

## Buttons

- PrimaryButton
- SecondaryButton
- GhostButton
- DestructiveButton
- IconButton
- SplitButton
- FloatingAddButton

## Forms

- TextInput
- NumericInput
- Select
- Combobox
- SegmentedControl
- RadioCard
- Checkbox
- Slider
- DatePicker
- TimePicker
- FileDropzone
- PhotoCapture
- VoiceRecorder
- BarcodeInput
- FormError
- ConsentCard

## Cards

- MealCard
- MealTimelineCard
- DailyBalanceCard
- InsightCard
- RecommendationCard
- RecipeCard
- ProgressCard
- ClientCard
- ConfidenceCard
- SourceBadge
- EmptyStateCard

## Data

- TrendChart
- RangeChart
- NutrientBar
- MacroDistribution
- HabitCalendar
- MetricTile
- ComparisonTable
- ReportSection

## Feedback

- Toast
- InlineAlert
- ConfirmationDialog
- BottomSheet
- Drawer
- Skeleton
- ProgressIndicator
- ConnectionStatus
- OfflineBanner

---

# 12. Technical architecture

# 12.1. Recommended repository

Repository: [alefcom1/jivoetelo](https://github.com/alefcom1/jivoetelo/)

Use a monorepo.

```text
/apps
  /web              Next.js public website + consumer SaaS + Pro UI
  /api              API service
  /worker           asynchronous jobs
  /telegram         future Telegram Mini App
/packages
  /ui               design system
  /domain           business types and rules
  /db               schema, migrations, seed
  /auth             shared auth logic
  /nutrition        calorie and nutrient calculations
  /ai               provider adapters and prompts
  /analytics        events and metrics
  /config           shared config
  /eslint-config
  /typescript-config
/docs
  architecture.md
  design-system.md
  implementation-plan.md
  api.md
  privacy-model.md
  screenshots/
```

Use:

- pnpm workspaces;
- Turborepo or equivalent task orchestration;
- TypeScript strict mode.

## 12.2. Frontend

Recommended:

- Next.js latest stable;
- App Router;
- React latest stable;
- TypeScript;
- server components where appropriate;
- client components only for interaction;
- Tailwind CSS or typed CSS variables with a clean token layer;
- Radix primitives where useful;
- custom components for branded visuals;
- TanStack Query for client-side server state where needed;
- React Hook Form plus schema validation;
- Zod or current equivalent;
- Framer Motion / Motion for purposeful animation;
- ECharts, Recharts or Visx after evaluating accessibility and bundle impact;
- Storybook for UI documentation;
- Playwright for end-to-end tests.

Do not ship default component-library styling.

## 12.3. Backend

Recommended:

- Node.js latest active LTS;
- NestJS or a similarly structured TypeScript API;
- REST API first;
- OpenAPI specification;
- event-driven jobs for AI, reports and notifications;
- PostgreSQL;
- Redis;
- BullMQ or equivalent queue;
- S3-compatible object storage;
- image processing worker;
- background report generation;
- provider abstraction for AI.

Alternative:

A single Next.js application can be used for an early prototype, but production architecture should keep heavy AI jobs and Telegram integration independent from web request lifecycles.

## 12.4. Authentication

Requirements:

- email login;
- passwordless email or secure password flow;
- email verification;
- session management;
- refresh/revocation;
- optional social login;
- Telegram login in later phase;
- role-based access control;
- organisation membership;
- device/session list;
- logout all sessions;
- optional passkeys later.

Roles:

```text
USER
PROFESSIONAL
ORG_OWNER
ORG_ADMIN
SUPPORT
CONTENT_EDITOR
FOOD_MODERATOR
BILLING_ADMIN
SUPER_ADMIN
```

## 12.5. Storage

Store:

- original meal photo;
- optimised derivatives;
- optional thumbnail;
- analysis JSON;
- user corrections.

Requirements:

- signed URLs;
- private buckets;
- configurable retention;
- delete original photo without deleting diary entry;
- malware scanning for uploads where appropriate;
- metadata stripping;
- size and type validation;
- background optimisation.

## 12.6. Payments

Create provider abstraction.

Potential web providers:

- YooKassa;
- CloudPayments;
- international provider if available to the operating entity;
- invoice / bank transfer for organisations.

Requirements:

- plans;
- trials;
- coupons only if genuinely used;
- webhooks;
- idempotency;
- invoices;
- cancellation;
- grace period;
- failed-payment state;
- subscription history.

Telegram Mini App payments must be implemented according to Telegram’s current rules at implementation time.

---

# 13. Data model

Core entities:

```text
User
UserProfile
UserPreferences
Consent
Session
Organisation
OrganisationMember
ProfessionalProfile
ClientRelationship
Goal
NutritionTarget
AdaptiveTargetSnapshot
BodyMeasurement
WeightEntry
WellbeingEntry
ActivityEntry
Meal
MealItem
Food
FoodVariant
FoodBrand
FoodSource
Barcode
Recipe
RecipeIngredient
Serving
MealTemplate
Favourite
PantryItem
ShoppingList
ShoppingListItem
MealPlan
MealPlanEntry
AIAnalysis
AIAnalysisItem
AICorrection
Recommendation
WeeklyReview
Insight
MessageThread
Message
ProfessionalNote
Program
ProgramModule
ProgramAssignment
CheckIn
Subscription
Payment
Notification
AuditEvent
FeatureFlag
SupportTicket
```

## 13.1. Food verification

Food record fields:

- name;
- canonical name;
- brand;
- barcode;
- region;
- source type;
- source URL or reference;
- verification state;
- nutrients per 100 g;
- serving options;
- raw/cooked/prepared state;
- duplicate group;
- moderation history;
- created by;
- reviewed by;
- confidence.

Verification states:

```text
VERIFIED_MANUFACTURER
VERIFIED_EXPERT
TRUSTED_DATABASE
CALCULATED_RECIPE
USER_PRIVATE
COMMUNITY_PENDING
COMMUNITY_UNVERIFIED
REJECTED
```

---

# 14. Nutrition calculation engine

## 14.1. Starting target

Use a clearly documented calculation.

Inputs:

- age;
- sex used for equation;
- height;
- weight;
- optional body-fat percentage;
- activity estimate;
- goal;
- desired rate.

Return a range, not false precision.

Store:

- equation;
- assumptions;
- activity multiplier;
- date;
- version.

## 14.2. Adaptive target

After sufficient data:

- use logged intake;
- use smoothed weight trend;
- detect missing-data periods;
- calculate an expenditure estimate;
- present a range and confidence;
- propose small target adjustment;
- require user confirmation.

Minimum conditions:

- enough weight entries;
- enough logged days;
- no clearly inconsistent data;
- no unsafe target.

Do not modify targets aggressively after a single week.

## 14.3. Trend weight

Use an exponential smoothing or equivalent documented method.

Show:

- scale weight;
- trend;
- rate;
- uncertainty.

## 14.4. Daily targets

Support:

- fixed target;
- range target;
- different weekday targets;
- training/rest-day variation later;
- specialist override;
- user visibility settings.

---

# 15. AI architecture

# 15.1. Provider abstraction

Do not couple business logic to one AI provider.

Interface examples:

```ts
interface MealVisionProvider {
  analyseMeal(input: MealVisionInput): Promise<MealVisionResult>;
}

interface NutritionAssistantProvider {
  generateRecommendation(
    input: RecommendationContext
  ): Promise<RecommendationDraft>;
}

interface SpeechMealProvider {
  transcribeAndParse(input: AudioInput): Promise<ParsedMealDraft>;
}
```

## 15.2. Meal vision pipeline

1. Validate image.
2. Create optimised analysis version.
3. Detect likely meal type.
4. Detect visible components.
5. Estimate portion ranges.
6. Map components to canonical food database.
7. Identify hidden-ingredient risks.
8. Calculate calories and nutrients.
9. Assign confidence level.
10. Generate one or two clarification questions.
11. Return editable draft.
12. Save only after user confirmation.

Structured output only.

Example:

```json
{
  "mealType": "lunch",
  "items": [
    {
      "label": "salmon",
      "canonicalFoodId": "food_123",
      "estimatedGrams": 142,
      "rangeGrams": [120, 170],
      "confidence": "high",
      "requiresClarification": false
    }
  ],
  "clarifications": [
    {
      "id": "dressing",
      "question": "Какая была заправка?",
      "options": ["Масло", "Йогурт", "Майонез", "Без заправки"]
    }
  ]
}
```

## 15.3. AI confidence

Confidence should combine:

- visual certainty;
- food database mapping quality;
- portion uncertainty;
- hidden ingredient risk;
- user correction history;
- recipe complexity.

Never present uncalibrated model confidence as medical precision.

## 15.4. Personal learning

Store user-specific corrections:

- typical cup size;
- preferred milk;
- usual breakfast;
- common restaurant;
- common cooking oil;
- saved recipes;
- preferred portion.

Use this to reduce future questions.

## 15.5. Recommendation engine

Separate deterministic constraints from generative language.

Deterministic layer:

- remaining energy range;
- macro gaps;
- allergens;
- exclusions;
- pantry;
- time;
- budget;
- target safety;
- recent meal repetition;
- specialist rules.

Ranking layer:

- nutritional fit;
- preference;
- convenience;
- satiety;
- variety;
- cost;
- preparation time.

Generative layer:

- explanation;
- substitutions;
- conversational response.

The AI must not invent nutrition values. Values must come from the database and calculation engine.

---

# 16. Integrations

Phase 2–3:

- Apple Health;
- Google Health Connect;
- smart scales where feasible;
- wearable data;
- email notifications;
- web push;
- calendar export for meal plan;
- recipe URL importer.

Future:

- grocery services;
- restaurant menus;
- delivery services;
- professional EHR systems where lawful;
- API;
- MCP server.

All integrations require granular permissions and revocation.

---

# 17. Telegram Mini App strategy

The Telegram Mini App is a companion, not a separate product.

## Primary actions

- log meal by photo;
- log meal by voice;
- view today;
- check remaining targets;
- ask what to eat;
- repeat recent meal;
- receive reminders;
- view weekly summary;
- message specialist.

## Telegram home screen

Show:

- greeting;
- daily balance;
- next action;
- recent meals;
- central photo button;
- assistant shortcut.

Do not replicate the entire desktop analytics suite.

## Authentication

- Telegram identity;
- explicit account linking;
- existing web account support;
- revoke link in settings;
- do not trust client-supplied Telegram data without server verification.

## Deep links

Examples:

```text
https://t.me/<bot>?startapp=add_meal
https://t.me/<bot>?startapp=today
https://t.me/<bot>?startapp=weekly_review
```

---

# 18. Admin panel

# 18.1. Food moderation

Moderator can:

- review pending products;
- compare duplicates;
- inspect source;
- edit nutrients;
- merge records;
- reject;
- mark verified;
- see user reports;
- inspect barcode conflicts;
- audit changes.

## 18.2. AI review queue

Show:

- low-confidence analyses;
- heavily corrected meals;
- mapping failures;
- new dish clusters;
- suspected unsafe recommendations;
- provider errors.

This queue is for quality improvement, not manual review of every private meal.

Privacy rules must determine what staff can see.

## 18.3. Content management

Manage:

- recipes;
- articles;
- FAQs;
- science references;
- onboarding copy;
- notification templates;
- subscription copy;
- feature announcements.

## 18.4. Support

Support staff can:

- search user;
- see account status;
- see billing status;
- see technical events;
- not see private meal photos by default;
- request explicit temporary support access;
- log all access.

---

# 19. Notifications

Channels:

- in-app;
- email;
- web push;
- Telegram later.

Categories:

- meal reminder;
- weekly review;
- target adjustment;
- specialist message;
- subscription;
- security;
- product update.

Rules:

- user controls each category;
- quiet hours;
- no guilt-based notifications;
- no false urgency;
- no public notification text revealing sensitive information.

Examples:

Good:

> Ваш недельный обзор готов.

Bad:

> Вы опять забыли записать еду!

---

# 20. SEO and content

## 20.1. SEO pages

Initial clusters:

- calorie calculator;
- protein calculator;
- calorie deficit explanation;
- food photo calorie estimation;
- meal planning;
- fibre;
- weight trend;
- nutrition diary;
- calorie counter for Russian foods;
- professional nutrition software.

Free tools can attract users, but each must lead naturally into the product.

## 20.2. Structured data

Implement where relevant:

- Organization;
- SoftwareApplication;
- FAQPage;
- Article;
- Recipe;
- BreadcrumbList;
- WebSite;
- Product / Offer when appropriate.

## 20.3. Content quality

Every article should:

- have author and reviewer fields;
- show update date;
- distinguish education from medical advice;
- cite sources;
- include actionable summary;
- avoid clickbait;
- link to relevant product tools.

---

# 21. Analytics

Track product events, not private food contents.

Core events:

```text
signup_started
signup_completed
onboarding_completed
meal_add_opened
meal_logged_manual
meal_logged_photo
meal_logged_voice
ai_analysis_completed
ai_analysis_corrected
recommendation_opened
recommendation_saved
weekly_review_viewed
target_adjustment_accepted
subscription_started
subscription_cancelled
professional_invite_sent
professional_client_connected
```

Metrics:

- activation;
- first meal logged;
- meals logged in first seven days;
- time to log;
- AI correction rate;
- recommendation save rate;
- weekly retention;
- paid conversion;
- professional client activation;
- churn;
- support rate.

Do not send raw meal descriptions, photos or health notes to third-party analytics by default.

---

# 22. Performance

Targets:

- Lighthouse performance above 90 on marketing pages;
- Core Web Vitals in good range;
- fast app shell;
- lazy-load heavy charts;
- responsive image formats;
- route-level code splitting;
- optimistic UI for meal save;
- background upload where supported;
- offline draft support for PWA;
- graceful AI processing status.

Meal logging must remain usable on slow mobile networks.

---

# 23. Security and privacy

Requirements:

- TLS everywhere;
- secure cookies;
- CSRF protection;
- rate limiting;
- input validation;
- upload validation;
- private object storage;
- signed URLs;
- encryption at rest where available;
- audit logs;
- least-privilege roles;
- secrets management;
- backup policy;
- restore test;
- dependency scanning;
- session revocation;
- webhook signature verification;
- idempotency;
- data export;
- account deletion;
- consent versioning;
- privacy-by-default.

Create:

- `/security`;
- `/privacy`;
- `security@jivoetelo.ru`;
- incident response procedure;
- retention table;
- processor register;
- access matrix.

---

# 24. Testing

## Unit tests

- calorie calculations;
- target bounds;
- trend calculation;
- adaptive adjustment;
- food nutrient calculations;
- serving conversions;
- role permissions;
- subscription rules;
- recommendation constraints.

## Integration tests

- registration;
- onboarding;
- meal creation;
- AI draft confirmation;
- photo deletion;
- specialist invitation;
- subscription webhook;
- data export;
- account deletion.

## End-to-end tests

1. New user registers and completes onboarding.
2. User logs breakfast manually.
3. User uploads meal photo and corrects one ingredient.
4. User opens “What should I eat now?” and adds a suggestion.
5. User records weight and opens progress.
6. User views weekly review and accepts adjustment.
7. Professional invites client and comments on meal.
8. User revokes professional access.
9. User cancels subscription.
10. User exports and deletes account.

## Visual regression

Cover:

- homepage;
- pricing;
- login;
- onboarding;
- today;
- AI analysis;
- progress;
- professional dashboard.

---

# 25. Seed data

Create a polished demo user.

Example profile:

- goal: moderate weight reduction;
- 21 days of weight data;
- 14 days of meal data;
- breakfast, lunch, dinner and snack;
- familiar Russian and international meals;
- several AI-confidence states;
- one specialist connection;
- weekly review;
- adaptive target proposal;
- pantry;
- meal plan.

Create a professional demo:

- 12 clients;
- different statuses;
- messages;
- reviews due;
- reports;
- one group program.

Do not use lorem ipsum in final demo screens.

---

# 26. Recommended first implementation milestones

## Milestone 0 — repository and foundations

- monorepo;
- environment setup;
- database;
- authentication skeleton;
- lint;
- test;
- CI;
- design tokens;
- Storybook.

## Milestone 1 — brand and marketing website

- Живое Тело logo placeholder system;
- navigation;
- hero;
- interactive AI meal demo;
- product sections;
- professionals page;
- pricing;
- science;
- responsive states;
- SEO;
- waitlist.

## Milestone 2 — app shell and onboarding

- protected routes;
- sidebar;
- mobile navigation;
- onboarding;
- profile;
- goal;
- starting targets;
- dashboard empty state.

## Milestone 3 — food diary

- foods;
- servings;
- search;
- meal timeline;
- manual add;
- favourites;
- recipes;
- daily calculations.

## Milestone 4 — photo AI

- upload;
- processing queue;
- provider adapter;
- structured result;
- confidence;
- clarification;
- correction;
- save.

## Milestone 5 — progress and weekly review

- weight;
- trend;
- nutrition averages;
- weekly report;
- adjustment proposal.

## Milestone 6 — subscription and production readiness

- plans;
- payment provider;
- webhooks;
- entitlement;
- privacy;
- export;
- deletion;
- monitoring;
- backups;
- deployment.

## Milestone 7 — Живое Тело Pro MVP

- professional profile;
- clients;
- invitations;
- dashboard;
- diary review;
- targets;
- messages;
- reports.

## Milestone 8 — Telegram Mini App

- Telegram auth;
- today;
- add by photo;
- voice;
- recommendations;
- reminders;
- deep links.

---

# 27. Definition of done for the first public release

The release is ready only when:

- public pages are visually complete;
- the design is consistent across desktop and mobile;
- user can register;
- onboarding works;
- user can log meals manually;
- user can upload a meal photo and confirm an editable AI draft;
- user can record weight;
- dashboard calculates daily values correctly;
- progress view shows a smoothed trend;
- privacy, terms and security pages exist;
- user can export and delete data;
- subscription state is reliable;
- empty, loading and error states exist;
- accessibility basics pass;
- production build passes;
- monitoring and backups are enabled;
- no secret is present in the repository;
- test seed can be removed from production;
- no page contains generic placeholder copy;
- screenshots confirm high visual quality at desktop and mobile widths.

---

# 28. Acceptance criteria for visual quality

Reject the implementation if:

- it resembles a standard admin template;
- most screens are white cards on a grey background without visual hierarchy;
- the homepage relies on a phone mockup and generic gradient;
- different pages use inconsistent radii or shadows;
- charts are rainbow-coloured;
- food photography is low quality or inconsistent;
- mobile screens are compressed desktop layouts;
- the AI analysis is only a text list;
- empty states are blank;
- icons come from multiple mismatched libraries;
- every section uses the same card grid;
- the interface uses shame, punishment or aggressive red states;
- animations distract from use;
- typography is too small;
- the product does not show a clear next action.

Approve the visual system when:

- the product is recognisable without the logo;
- the food imagery, cobalt accent, warm background and typography form one identity;
- the daily dashboard communicates the next action in under three seconds;
- the AI camera screen feels like the flagship experience;
- the professional dashboard feels credible for paid work;
- mobile interaction feels native and intentional;
- charts communicate trends without requiring expert interpretation;
- the interface feels premium in both light and dark themes.

---

# 29. Initial copy library

## Hero

**Не просто считайте калории. Знайте, что съесть дальше.**

Живое Тело распознаёт еду по фото, честно показывает точность оценки, адаптируется к вашему прогрессу и помогает выбрать следующий приём пищи.

## AI camera

**Один снимок — и вы уже знаете больше.**

Живое Тело распознаёт компоненты блюда, оценивает порции и задаёт только те вопросы, которые действительно влияют на результат.

## Adaptive plan

**Формула даёт старт. Ваше тело уточняет план.**

## Emotional safety

**Ни одного “проваленного дня”.**

Питание — это тренд, а не экзамен. Если день вышел за план, Живое Тело не предлагает наказаний и компенсаций.

## Recommendation

**Что подойдёт вам сейчас?**

Учитываем остаток дня, голод, время, бюджет, продукты дома и ваши предпочтения.

## Professional

**Меньше таблиц. Больше времени на клиента.**

## Final CTA

**Питание становится проще, когда следующий шаг понятен.**

---

# 30. External product references

Use these products for competitive study, not for visual copying:

- MacroFactor — adaptive expenditure and weight trend;
- Cronometer — verified nutrition data, micronutrients and professional analysis;
- Lifesum — multimodal logging and polished mass-market UX;
- YAZIO — onboarding, plans and recipes;
- Foodvisor — photo-first meal recognition;
- Practice Better — client portal and professional workflows;
- MyFitnessPal — large-scale logging patterns and integrations.

Primary references reviewed:

- https://macrofactorapp.com/macrofactor/
- https://macrofactorapp.com/algorithm-accuracy/
- https://cronometer.com/
- https://cronometer.com/pro/pro-trial.html
- https://lifesum.com/
- https://www.foodvisor.io/en/
- https://practicebetter.io/features/client-portal
- https://www.yazio.com/en

Do not clone layouts, text, icons or proprietary interaction patterns.

---

# 31. Final product statement

Живое Тело must become the most visually refined and emotionally intelligent nutrition platform in the Russian-speaking market.

The competitive advantage is not one isolated feature.

It is the combination of:

- beautiful and fast logging;
- transparent AI uncertainty;
- adaptive targets;
- a useful “What should I eat now?” decision engine;
- non-judgmental language;
- Russian food context;
- professional SaaS;
- one shared platform for web and Telegram.

The first release should already communicate this future, even if advanced modules are marked as coming later.
