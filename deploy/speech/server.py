"""
Сервис распознавания речи для «Живого Тела».

Договор описан в docs/speech.md и задан приложением (lib/speech/gigaam.ts):
POST с байтами записи в теле и её типом в Content-Type, ответ — JSON
{"text": "...", "confidence": 0.9}.

Стандартная библиотека и ничего больше: сервер тут — сорок строк обвязки,
и тащить ради них веб-фреймворк в контейнер с моделью незачем. Вся
изменяемая часть — одна функция transcribe().
"""

import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8081"))
TOKEN = os.environ.get("SPEECH_TOKEN", "").strip()
# Тот же предел, что и на стороне приложения (lib/speech/limits.ts). Держим
# свой: точка приёма не должна зависеть от того, что клиент себя ограничил.
MAX_BYTES = 1024 * 1024

_model = None


def load_model():
    """
    Модель грузится один раз и лениво — при первом запросе, а не при старте.

    Так контейнер поднимается сразу и не держит гигабайт памяти, пока никто
    не записал ни одного голосового. На сервере, где память общая, это не
    мелочь.
    """
    global _model
    if _model is None:
        import gigaam  # ставится в Dockerfile

        _model = gigaam.load_model(os.environ.get("GIGAAM_MODEL", "v2_rnnt"))
    return _model


def to_wav(data: bytes, mime: str) -> str:
    """
    Приводим что прислали к 16 кГц моно WAV — модель принимает только его.

    Telegram шлёт ogg/opus, браузеры — webm или mp4. Разбирать их своими
    руками незачем: ffmpeg уже есть в образе и делает это одной командой.
    """
    with tempfile.NamedTemporaryFile(suffix=".in", delete=False) as src:
        src.write(data)
        src_path = src.name
    dst_path = src_path + ".wav"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src_path, "-ac", "1", "-ar", "16000", dst_path],
        check=True,
        timeout=30,
    )
    os.unlink(src_path)
    return dst_path


def transcribe(data: bytes, mime: str) -> str:
    """Единственное место, которое меняется при смене модели."""
    wav = to_wav(data, mime)
    try:
        return load_model().transcribe(wav).strip()
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
        self.reply(200, {"ok": True})

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
            text = transcribe(data, self.headers.get("Content-Type", ""))
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
