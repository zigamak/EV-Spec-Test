"""Persistent logging setup — so errors are captured in a file regardless
of how the server happens to be started (terminal, background process,
IDE run button), not just visible in whoever's terminal launched it.

Writes to api/logs/app.log (rotating, 5MB x 3 backups) AND stdout, so
`uvicorn ... --reload` run directly in a terminal still shows everything
live there too — this doesn't replace the console, it just also persists it.
"""

import logging
import logging.handlers
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_FILE = LOG_DIR / "app.log"


def configure_logging() -> None:
    LOG_DIR.mkdir(exist_ok=True)

    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )

    file_handler = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3
    )
    file_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)

    # uvicorn's own loggers (access log, error log) — attach the same file
    # handler so request lines and startup errors land in app.log too, not
    # just this app's own log calls. propagate=False so these don't ALSO
    # bubble up to root (which has the same handler) and double-log.
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.addHandler(file_handler)
        uvicorn_logger.propagate = False
