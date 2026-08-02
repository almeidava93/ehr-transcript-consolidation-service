# Relevant paths
import os
from pathlib import Path
from typing import Final

VERSION = "0.1.0"
TITLE = "EHR and transcript validation service"

BASE_PATH = Path(__file__).parent
LOCAL_DATABASE_PATH = BASE_PATH.parent / "db"
LOCAL_DATABASE_PATH.mkdir(exist_ok=True)
TRACES_DB_PATH = LOCAL_DATABASE_PATH / "traces.db"

# Logging settings
DEFAULT_LOGGING_LEVEL = "ERROR"
DEFAULT_LOG_FORMAT: Final = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
DEFAULT_DATE_FORMAT: Final = "%Y-%m-%d %H:%M:%S"

# Database settings
MYSQL_USER: str | None = os.environ.get("MYSQL_USER")
MYSQL_PASSWORD: str | None = os.environ.get("MYSQL_PASSWORD")
MYSQL_ROOT_PASSWORD: str | None = os.environ.get("MYSQL_ROOT_PASSWORD")
MYSQL_HOST: str | None = os.environ.get("MYSQL_HOST")
MYSQL_PORT: int = int(os.environ.get("MYSQL_PORT", default=3306))
MYSQL_DATABASE: str | None = os.environ.get("MYSQL_DATABASE")
