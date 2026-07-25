# ---- Stage 1: Run tests ----
FROM python:3.12 AS test

WORKDIR /app

COPY pyproject.toml .
RUN pip install uv
RUN uv sync --no-cache --no-install-project

COPY . .

RUN uv run pytest


# ---- Stage 2: Build the application ----
FROM python:3.12-slim AS production

WORKDIR /app

# Install the application dependencies
COPY --from=test /app/pyproject.toml .
COPY --from=test /app/uv.lock .
RUN pip install uv
RUN uv sync --locked --no-dev --no-cache --no-install-project

# Create system user and home directory
RUN groupadd -r appgroup && useradd -r -g appgroup -m user

# Fix ownership and permissions in a single layer to save space
RUN chown -R user:appgroup /app \
&& chmod -R 750 /app

# Run from virtual environment
ENV PATH="/app/.venv/bin:$PATH"

# Copy in the source code
COPY api ./api
EXPOSE 8080

# Set up a non-root user to run the application
USER user

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8080"]
