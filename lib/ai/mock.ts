import type { MealAnalysis, MealInput, MealVisionProvider } from "./types.ts";

/**
 * Детерминированный провайдер для разработки и демо без API-ключа.
 * Возвращает правдоподобный разбор с одним уточняющим вопросом,
 * чтобы можно было пройти весь поток «разбор → правка → сохранение».
 */
export class MockMealProvider implements MealVisionProvider {
  async analyseMeal(input: MealInput): Promise<MealAnalysis> {
    const isPhoto = input.kind === "photo";
    return {
      mealType: "breakfast",
      items: [
        {
          name: isPhoto ? "Сырники" : "Сырники",
          estimatedGrams: 180,
          confidence: isPhoto ? "medium" : "high",
          per100g: { kcal: 220, protein: 15, fat: 9, carbs: 18, fiber: 1 },
        },
        {
          name: "Сметана",
          estimatedGrams: 30,
          confidence: "medium",
          per100g: { kcal: 200, protein: 2.5, fat: 20, carbs: 3, fiber: 0 },
        },
      ],
      clarifications: [
        {
          question: "Был ли напиток с сахаром?",
          options: [
            {
              label: "Да, с сахаром",
              addItem: {
                name: "Сахар",
                estimatedGrams: 10,
                confidence: "medium",
                per100g: { kcal: 398, protein: 0, fat: 0, carbs: 99.7, fiber: 0 },
              },
            },
            { label: "Без сахара" },
          ],
        },
      ],
    };
  }
}
