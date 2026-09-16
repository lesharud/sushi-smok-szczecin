#!/usr/bin/env python3
"""Local-only setup. Hidden token input, chat discovery, no keys in output/history."""
import getpass
import json
import os
import re
import secrets
import sys
import urllib.request
from pathlib import Path


def main():
    path = Path(__file__).resolve().parents[1] / '.env.local'
    if path.is_symlink():
        raise ValueError()
    token = getpass.getpass('Токен BotFather (ввод скрыт): ').strip()
    if not re.fullmatch(r'\d+:[A-Za-z0-9_-]{20,}', token):
        raise ValueError()

    def call(method):
        with urllib.request.urlopen('https://api.telegram.org/bot' + token + '/' + method, timeout=10) as response:
            data = json.load(response)
        if not data.get('ok'):
            raise ValueError()
        return data['result']

    call('getMe')
    updates = call('getUpdates')
    chats = {}
    for update in updates:
        message = update.get('message', {})
        chat = message.get('chat', {})
        if chat.get('type') in ('group', 'supergroup', 'private') and 'id' in chat:
            chats[str(chat['id'])] = chat.get('title') or 'Личный чат'
    if not chats:
        print('Отправьте боту /start или /start@имя_бота в закрытой группе и повторите запуск. Ничего не записано.')
        return
    entries = list(chats.items())
    for index, (_, title) in enumerate(entries, 1):
        print(str(index) + '. ' + re.sub(r'[\x00-\x1f\x7f]', ' ', title))
    # Explicit recipient confirmation prevents picking the wrong staff chat.
    selected = int(input('Номер чата ресторана для уведомлений: ')) - 1
    if selected < 0 or selected >= len(entries):
        raise ValueError()
    text = path.read_text() if path.exists() else ''
    values = {'TELEGRAM_BOT_TOKEN': token, 'TELEGRAM_CHAT_ID': entries[selected][0]}
    if not re.search(r'^NOTIFICATION_WORKER_SECRET=.+$', text, re.M):
        values['NOTIFICATION_WORKER_SECRET'] = secrets.token_hex(32)
    for name, value in values.items():
        text = re.sub(r'^' + name + r'=.*\n?', '', text, flags=re.M)
        text = text.rstrip() + '\n' + name + '=' + value + '\n'
    # Restrict permissions before writing, including an existing file.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as file:
        file.write(text)
        file.truncate()
    print('Проверено и сохранено только в .env.local (600). Production не изменён; сообщение не отправлено.')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt):
        # HTTP exceptions may include the token in their URL. Never print them.
        print('Настройка не завершена. Проверьте токен, доступ к Telegram и выбранный чат.')
        sys.exit(1)
