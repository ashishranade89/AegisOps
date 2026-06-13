# Stage 1: Build React frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend
FROM python:3.12-slim
WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN mkdir -p data incident_memory_db

ENV CHECKPOINT_DB_PATH=data/checkpoints.db
ENV RUNS_DB_PATH=data/runs.db
ENV ALLOW_CLIENT_API_KEYS=true

EXPOSE 8004

CMD ["sh", "-c", "uv run uvicorn backend.api.app:app --host 0.0.0.0 --port ${PORT:-8004}"]
