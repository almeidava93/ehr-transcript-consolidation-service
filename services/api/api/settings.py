# Relevant paths
from pathlib import Path


BASE_PATH = Path(__file__).parent
LOCAL_DATABASE_PATH = BASE_PATH.parent / "db"
LOCAL_DATABASE_PATH.mkdir(exist_ok=True)
TRACES_DB_PATH = LOCAL_DATABASE_PATH / "traces.db"
