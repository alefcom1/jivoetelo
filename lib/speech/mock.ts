import { checkAudio } from "./limits.ts";
import { SpeechError, type SpeechInput, type SpeechProvider, type TranscriptResult } from "./types.ts";

/**
 * Расшифровка-заглушка для разработки и тестов.
 *
 * Возвращает описание еды, потому что дальше текст идёт в разбор еды: поток
 * «голосовое → расшифровка → разбор → правка → сохранение» должен
 * проходиться целиком без сети. Ответ не случайный, а выведенный из размера
 * файла — тогда два разных голосовых в тесте дают два разных текста, и
 * ошибку «расшифровка не дошла до разбора» видно сразу.
 *
 * В продакшен не попадает: resolveSpeechMode превращает там `mock` в `off`.
 */
const PHRASES = [
  "овсянка на воде двести грамм и банан",
  "куриная грудка сто пятьдесят грамм с гречкой",
  "два яйца и кусок ржаного хлеба",
  "творог пять процентов сто восемьдесят грамм",
];

export class MockSpeechProvider implements SpeechProvider {
  async transcribe(input: SpeechInput): Promise<TranscriptResult> {
    checkAudio(input);
    // Байт нулевой длины сюда не дойдёт — checkAudio отсекает раньше.
    const index = input.data.length % PHRASES.length;
    return { text: PHRASES[index], confidence: 0.9 };
  }
}

/**
 * Заглушка, которая всегда «ничего не расслышала». Нужна тестам ветки
 * `empty`: без неё её пришлось бы проверять только на настоящем сервисе.
 */
export class SilentSpeechProvider implements SpeechProvider {
  async transcribe(input: SpeechInput): Promise<TranscriptResult> {
    checkAudio(input);
    throw new SpeechError("no speech detected", "empty");
  }
}
