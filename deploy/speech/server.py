"""
Сервис распознавания речи для «Живого Тела».

Договор описан в docs/speech.md и задан приложением (lib/speech/gigaam.ts):
POST с байтами записи в теле и её типом в Content-Type, ответ — JSON
{"text": "...", "confidence": 0.9}.

Стандартная библиотека и ничего больше: сервер тут — обвязка вокруг одной
функции transcribe(), и тащить ради неё веб-фреймворк в контейнер незачем.

## Движок выбирается переменной SPEECH_ENGINE

Не ради гибкости как таковой: выбор здесь неочевиден и упирается в память.
Рантайм vosk весит 7 МБ, whisper.cpp — 4 МБ, а torch, без которого не
работает GigaAM, — 427 МБ. На общем VPS это решающая разница, и сравнение
целиком лежит в docs/speech.md.

Домен у нас узкий: люди диктуют еду и числа, а не свободную речь. Маленькая
модель здесь работает заметно лучше своего общего WER — особенно со
словарём (VOSK_GRAMMAR), который сужает выбор до того, что вообще бывает
едой.
"""

import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8081"))
TOKEN = os.environ.get("SPEECH_TOKEN", "").strip()
ENGINE = os.environ.get("SPEECH_ENGINE", "vosk").strip().lower()
# Тот же предел, что и на стороне приложения (lib/speech/limits.ts). Держим
# свой: точка приёма не должна зависеть от того, что клиент себя ограничил.
MAX_BYTES = 1024 * 1024
SAMPLE_RATE = 16000

_engine = None


def to_wav(data: bytes) -> str:
    """
    Приводим что прислали к 16 кГц моно WAV — этого формата ждут все движки.

    Telegram шлёт ogg/opus, браузеры — webm или mp4. Разбирать их своими
    руками незачем: ffmpeg уже есть в образе и делает это одной командой.
    """
    with tempfile.NamedTemporaryFile(suffix=".in", delete=False) as src:
        src.write(data)
        src_path = src.name
    dst_path = src_path + ".wav"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", src_path,
             "-ac", "1", "-ar", str(SAMPLE_RATE), dst_path],
            check=True,
            timeout=30,
        )
    finally:
        os.unlink(src_path)
    return dst_path


# --- движки ---------------------------------------------------------------
#
# У каждого одна обязанность: получить путь к WAV и вернуть строку.


class VoskEngine:
    """
    Самый лёгкий из рабочих вариантов: рантайм 7 МБ, маленькая русская модель —
    десятки мегабайт. Kaldi под капотом, процессор, задуман для слабых машин.

    ## Словарь — главный рычаг качества

    Если задан VOSK_GRAMMAR (путь к JSON-массиву слов), распознавание
    ограничивается им. Для нашего случая это важнее выбора модели: человек
    диктует еду и числа, и маленькая модель, которой не дают выбирать из
    всего русского языка, ошибается заметно реже. Список собирается из
    lib/food-reference.ts скриптом scripts/speech-grammar.mjs.

    "[unk]" в словаре обязателен: без него незнакомое слово не отбрасывается,
    а подменяется ближайшим из списка — и человек получает еду, которой не
    называл. Молчание тут лучше выдумки, как и везде в этом продукте.

    Без VOSK_GRAMMAR работает по всему языку, как обычно.
    """

    def __init__(self) -> None:
        import vosk

        vosk.SetLogLevel(-1)
        self._vosk = vosk
        self._model = vosk.Model(os.environ.get("VOSK_MODEL_PATH", "/models/vosk"))
        self._grammar = None
        path = os.environ.get("VOSK_GRAMMAR", "").strip()
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as file:
                words = json.load(file)
            self._grammar = json.dumps(sorted(set(words)) + ["[unk]"], ensure_ascii=False)

    def transcribe(self, wav_path: str) -> str:
        import wave

        with wave.open(wav_path, "rb") as audio:
            rate = audio.getframerate()
            recognizer = (
                self._vosk.KaldiRecognizer(self._model, rate, self._grammar)
                if self._grammar
                else self._vosk.KaldiRecognizer(self._model, rate)
            )
            recognizer.SetWords(False)
            while True:
                chunk = audio.readframes(4000)
                if not chunk:
                    break
                recognizer.AcceptWaveform(chunk)
            return json.loads(recognizer.FinalResult()).get("text", "").strip()


class WhisperCppEngine:
    """
    Середина: рантайм 4 МБ, модель `small` в квантованном виде — сотни
    мегабайт. По-русски точнее маленького Vosk на свободной речи, но и памяти
    просит в несколько раз больше.

    Словаря не поддерживает. Подсказать можно только начальным промптом
    (WHISPER_PROMPT): он смещает распознавание в сторону нужной лексики, но
    не ограничивает его, и выдумать слово со стороны по-прежнему может.
    """

    def __init__(self) -> None:
        from pywhispercpp.model import Model

        self._model = Model(
            os.environ.get("WHISPER_MODEL_PATH", "/models/whisper.bin"),
            language="ru",
            n_threads=int(os.environ.get("WHISPER_THREADS", "2")),
        )
        self._prompt = os.environ.get("WHISPER_PROMPT", "").strip() or None

    def transcribe(self, wav_path: str) -> str:
        kwargs = {"initial_prompt": self._prompt} if self._prompt else {}
        segments = self._model.transcribe(wav_path, **kwargs)
        return " ".join(segment.text for segment in segments).strip()


class GigaamEngine:
    """
    Самый точный по-русски и самый тяжёлый: тянет torch (колесо 427 МБ) и
    держит около гигабайта в памяти. Осмысленен, когда распознавание живёт на
    отдельной машине и точность важнее памяти.
    """

    def __init__(self) -> None:
        import gigaam

        self._model = gigaam.load_model(os.environ.get("GIGAAM_MODEL", "v2_rnnt"))

    def transcribe(self, wav_path: str) -> str:
        return self._model.transcribe(wav_path).strip()


ENGINES = {"vosk": VoskEngine, "whisper": WhisperCppEngine, "gigaam": GigaamEngine}


def load_engine():
    """
    Движок грузится один раз и лениво — при первом запросе, а не при старте.

    Так контейнер поднимается сразу и не держит модель в памяти, пока никто
    не записал ни одного голосового. На сервере, где память общая, это не
    мелочь.
    """
    global _engine
    if _engine is None:
        if ENGINE not in ENGINES:
            raise RuntimeError(f"неизвестный SPEECH_ENGINE={ENGINE}, есть: {', '.join(ENGINES)}")
        _engine = ENGINES[ENGINE]()
    return _engine


def transcribe(data: bytes) -> str:
    wav = to_wav(data)
    try:
        return load_engine().transcribe(wav)
    finally:
        os.unlink(wav)


class Handler(BaseHTTPRequestHandler):
    def reply(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        # Проверка живости для docker healthcheck: модель при этом не грузим.
        self.reply(200, {"ok": True, "engine": ENGINE})

    def do_POST(self) -> None:
        if TOKEN and self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.reply(401, {"error": "unauthorized"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            self.reply(413, {"error": "bad size"})
            return

        data = self.rfile.read(length)
        try:
            text = transcribe(data)
        except Exception as error:  # noqa: BLE001 — наружу уходит один и тот же отказ
            self.log_error("transcribe failed: %s", error)
            self.reply(502, {"error": "transcribe failed"})
            return

        # Пустая строка — законный ответ: речи в записи не нашлось.
        # Приложение скажет об этом человеку отдельными словами.
        self.reply(200, {"text": text})

    def log_message(self, fmt: str, *args) -> None:
        # Путь и параметры не пишем: в них ничего нет, а лог растёт.
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
