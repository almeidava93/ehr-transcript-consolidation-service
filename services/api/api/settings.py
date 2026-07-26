# Relevant paths
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
