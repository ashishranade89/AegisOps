"""Fernet-based encryption for monitor credentials stored in SQLite."""
import json
from pathlib import Path

from cryptography.fernet import Fernet

_KEY_PATH = Path(__file__).parent.parent.parent / "data" / "monitor.key"
_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet
    _KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if _KEY_PATH.exists():
        key = _KEY_PATH.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        _KEY_PATH.write_bytes(key)
    _fernet = Fernet(key)
    return _fernet


def encrypt(creds: dict) -> str:
    return _get_fernet().encrypt(json.dumps(creds).encode()).decode()


def decrypt(token: str) -> dict:
    return json.loads(_get_fernet().decrypt(token.encode()).decode())
