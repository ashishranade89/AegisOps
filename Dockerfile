FROM python:3.13-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

RUN mkdir -p data incident_memory_db

ENV CHECKPOINT_DB_PATH=data/checkpoints.db
ENV RUNS_DB_PATH=data/runs.db
ENV ALLOW_CLIENT_API_KEYS=false

EXPOSE 8004

CMD ["uv", "run", "uvicorn", "backend.api.app:app", "--host", "0.0.0.0", "--port", "8004"]
