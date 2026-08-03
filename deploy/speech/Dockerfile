# Сервис распознавания речи. Отдельный образ, а не слой в основном: набор
# зависимостей здесь свой и меняется вместе с движком, а пересобирать из-за
# него сайт незачем.
#
# По умолчанию собирается лёгкий вариант. Тяжёлый нужен не всем и не всегда,
# а разница в размере — два порядка: колесо vosk весит 7 МБ, torch — 427 МБ.
#
#   docker build .                              → vosk (по умолчанию)
#   docker build --build-arg ENGINE=whisper .   → whisper.cpp
#   docker build --build-arg ENGINE=gigaam .    → GigaAM (тянет torch)
ARG ENGINE=vosk

FROM python:3.11-slim AS base
# ffmpeg приводит ogg/webm/mp4 к 16 кГц моно WAV — единственному формату,
# который принимают все три движка.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- лёгкий: Kaldi под капотом, ни строчки Python-математики ---------------
FROM base AS engine-vosk
RUN pip install --no-cache-dir vosk

# --- средний: C++ внутри, модель квантованная ------------------------------
FROM base AS engine-whisper
RUN pip install --no-cache-dir pywhispercpp

# --- тяжёлый: CPU-сборка torch. Обычная тянет CUDA на несколько гигабайт, ---
# --- а видеокарты на сервере нет и не будет --------------------------------
FROM base AS engine-gigaam
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir gigaam

FROM engine-${ENGINE} AS final
ARG ENGINE
COPY server.py .
# Веса скачиваются в том, а не в образ: гигабайт в слое означал бы такую же
# выкачку при каждом обновлении сервиса.
ENV SPEECH_ENGINE=${ENGINE} HF_HOME=/models PORT=8081
EXPOSE 8081
CMD ["python", "-u", "server.py"]
