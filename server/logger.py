"""Shared logging: file + stdout for all processes."""
import logging
import os
from datetime import datetime
from pathlib import Path

LOG_DIR = Path(os.environ.get("IDEOGRAM4_LOG_DIR", Path(__file__).resolve().parent.parent / "logs"))

_process_logger: logging.Logger | None = None
_log_file: Path | None = None


def get_logger(name: str) -> logging.Logger:
    global _process_logger, _log_file
    if _process_logger is not None:
        return _process_logger

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    _log_file = LOG_DIR / f"{name}-{ts}.log"

    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    fh = logging.FileHandler(str(_log_file), encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(
        "%(asctime)s  %(levelname)-7s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    ))

    sh = logging.StreamHandler()
    sh.setLevel(logging.INFO)
    sh.setFormatter(logging.Formatter("[%(name)s] %(message)s"))

    logger.addHandler(fh)
    logger.addHandler(sh)

    logger.info("Log file: %s", _log_file)
    _process_logger = logger
    return logger


def get_log_file() -> Path | None:
    return _log_file
