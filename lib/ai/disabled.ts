import { MealAnalysisError, type MealAnalysisResult, type MealVisionProvider } from "./types.ts";
import type { SuggestionProvider, SuggestionResult } from "./suggest.ts";

/**
 * Провайдеры для режима, когда AI сознательно выключен (`AI_PROVIDER=off`).
 *
 * Зачем отдельный режим, если есть mock. Mock возвращает один и тот же
 * правдоподобный разбор — сырники со сметаной — что бы ему ни прислали. Для
 * разработки и тестов это ровно то, что нужно: поток «разбор → правка →
 * сохранение» проходится целиком без внешних вызовов. А в бою тот же ответ
 * означает, что человек фотографирует свой ужин и читает про сырники,
 * оформленные точно так же, как настоящий разбор. На сервисе о питании,
 * у которого есть отдельная страница «почему это не медицина», выдуманные
 * цифры хуже честного отказа.
 *
 * Поэтому режимов два: `mock` — для разработки, `off` — для боя, пока разбор
 * не включён. Отказ идёт обычным путём ошибки: экраны уже умеют его
 * показывать и предлагать ручной ввод.
 */
export class DisabledMealProvider implements MealVisionProvider {
  async analyseMeal(): Promise<MealAnalysisResult> {
    throw new MealAnalysisError("AI analysis is disabled (AI_PROVIDER=off)", "disabled");
  }
}

export class DisabledSuggestionProvider implements SuggestionProvider {
  async suggest(): Promise<SuggestionResult> {
    throw new MealAnalysisError("AI suggestions are disabled (AI_PROVIDER=off)", "disabled");
  }
}
