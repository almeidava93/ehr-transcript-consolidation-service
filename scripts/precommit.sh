cd ./services/api 
uv sync --dev
uv run ruff check
uv run ruff format
uv run mypy .
uv run pytest .