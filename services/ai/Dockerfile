FROM python:3.11-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

COPY services/ai/pyproject.toml ./
COPY services/ai/requirements.lock ./
COPY services/ai/app app
RUN python -m pip install --require-hashes --no-deps -r requirements.lock \
    && python -m pip install --no-deps .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
