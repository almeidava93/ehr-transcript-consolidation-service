import logging
import sys

from api import settings


def configure_logging(
    level: int | str = settings.DEFAULT_LOGGING_LEVEL,
) -> None:
    """Configure application-wide logging.

    Call this once when the application starts.
    """
    logging.basicConfig(
        level=level,
        format=settings.DEFAULT_LOG_FORMAT,
        datefmt=settings.DEFAULT_DATE_FORMAT,
        force=True,
    )

    root_logger = logging.getLogger()
    if not root_logger.handlers:
        root_logger.addHandler(logging.StreamHandler(sys.stdout))


def get_logger(
    name: str, level: int | str = settings.DEFAULT_LOGGING_LEVEL
) -> logging.Logger:
    """Return a named logger."""
    logger = logging.getLogger(name)
    logger.setLevel(level)
    return logger
