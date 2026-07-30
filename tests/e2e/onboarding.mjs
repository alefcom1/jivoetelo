// Прохождение онбординга в e2e — одним местом на все сценарии.
//
// Онбординг v2 — мастер из девяти шагов вместо одной формы, и когда он
// приехал, три e2e-сценария молча сломались: они заполняли поля старой
// формы, которых больше нет. Никто этого не заметил, потому что e2e не
// гоняются в CI. Копия этой последовательности в каждом сценарии означала
// бы, что следующая правка мастера сломает их снова — и снова три раза.
//
// Числовые поля мастера сознательно без атрибута name: они управляемые,
// значение живёт в состоянии React, а на сервер уходит скрытыми полями на
// шаге «Готово». Поэтому целимся в единственный input текущего шага.

/** Жмёт «Далее», дождавшись, пока кнопка перестанет быть заблокированной. */
async function next(page) {
  const button = page.locator('button:has-text("Далее")');
  await button.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(
    () => ![...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Далее")?.disabled,
    undefined,
    { timeout: 10000 },
  );
  await button.click();
}

/**
 * Проходит мастер целиком и сохраняет план.
 *
 * @param answers.goal `lose` | `maintain` | `gain`
 * @param answers.pace Ключ темпа (`lib/pace.ts`). Учитывается только при
 *   цели «снижение веса»: у остальных целей шага темпа в мастере нет.
 */
export async function completeOnboarding(page, base, answers = {}) {
  const {
    goal = "maintain",
    relationship = "calm",
    sexForFormula = "female",
    birthYear = "1990",
    heightCm = "168",
    weightKg = "65",
    activity = "light",
    pace = "moderate",
  } = answers;

  await page.goto(`${base}/app/onboarding`);
  await page.waitForSelector(".onboarding-form", { timeout: 15000 });

  await page.check(`input[name="goal"][value="${goal}"]`);
  await next(page);
  await page.check(`input[name="relationship"][value="${relationship}"]`);
  await next(page);
  await page.check(`input[name="sexForFormula"][value="${sexForFormula}"]`);
  await next(page);
  await page.fill(".onboarding-numbers input", String(birthYear));
  await next(page);
  await page.fill(".onboarding-numbers input", String(heightCm));
  await next(page);
  await page.fill(".onboarding-numbers input", String(weightKg));
  await next(page);
  await page.check(`input[name="activity"][value="${activity}"]`);
  await next(page);

  // Шаг темпа существует только у цели «снижение веса» — и то не всегда
  // (для несовершеннолетних он пропускается по безопасности). Поэтому не
  // предполагаем, а смотрим, что на экране. Именно радиокнопку: на шаге
  // «Готово» есть ещё и скрытое поле с тем же именем, и по одному только
  // name шаг темпа «находился» бы всегда.
  if (await page.locator('input[type="radio"][name="pace"]').count() > 0) {
    await page.check(`input[type="radio"][name="pace"][value="${pace}"]`);
    await next(page);
  }

  // Живой пересчёт: план обязан появиться до сохранения — ради этого мастер
  // и делался, и его отсутствие означало бы, что предпросмотр отвалился.
  await page.waitForSelector(".onboarding-preview-detail", { timeout: 15000 });
  await page.click('button:has-text("Сохранить план")');
  await page.waitForURL("**/app", { timeout: 15000 });
}
