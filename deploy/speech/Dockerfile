# Сервис распознавания речи. Отдельный образ, а не слой в основном:
# зависимости здесь тяжёлые (torch), и пересобирать из-за них сайт незачем.
FROM python:3.11-slim

# ffmpeg приводит ogg/webm/mp4 к 16 кГц моно WAV — единственному формату,
# который принимает модель.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# CPU-сборка torch: обычная тянет CUDA на несколько гигабайт, а видеокарты
# на сервере нет и не будет.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir gigaam

WORKDIR /app
COPY server.py .

# Веса скачиваются при первом запросе в том, а не в образ: гигабайт с лишним
# в слое означал бы такую же выкачку при каждом обновлении сервиса.
ENV HF_HOME=/models GIGAAM_MODEL=v2_rnnt PORT=8081
EXPOSE 8081
CMD ["python", "-u", "server.py"]
