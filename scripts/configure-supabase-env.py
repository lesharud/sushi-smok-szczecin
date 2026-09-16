"""Interactive local configuration. Never prints secrets or puts them in shell history."""
import getpass
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlsplit

if not sys.stdin.isatty():
    raise SystemExit("Запустите этот скрипт самостоятельно в интерактивном терминале.")

root = Path(__file__).resolve().parent.parent
target = root / ".env.local"
if target.is_symlink():
    raise SystemExit(".env.local является ссылкой. Настройка остановлена.")
url = input("SUPABASE_URL (https://…supabase.co): ").strip().rstrip("/")
parsed = urlsplit(url)
if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
    raise SystemExit("Нужен HTTPS-адрес проекта без пути, логина, query и fragment.")
secret = getpass.getpass("SUPABASE_SECRET_KEY (вставка скрыта, затем Enter): ").strip()
if not re.fullmatch(r"sb_secret_[A-Za-z0-9_-]+", secret):
    raise SystemExit("Ожидается серверный ключ sb_secret_…; файл не изменён.")
text = target.read_text() if target.exists() else "VITE_SITE_INDEXABLE=false\n"
lines = [line for line in text.splitlines() if not re.match(r"^\s*(?:export\s+)?(?:SUPABASE_URL|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*=", line)]
lines += ["SUPABASE_URL='" + url + "'", "SUPABASE_SECRET_KEY='" + secret + "'"]
# The temporary file is private from creation; replace atomically, preserving other variables.
fd, name = tempfile.mkstemp(prefix=".env.local.", dir=root)
try:
    with os.fdopen(fd, "w") as output:
        output.write("\n".join(lines) + "\n")
    os.chmod(name, 0o600)
    os.replace(name, target)
finally:
    if os.path.exists(name):
        os.unlink(name)
print(".env.local сохранён с правами 600. Значения не выводились. Сообщите: «Готово».")
