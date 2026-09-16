# Stage 3 — уведомления Sushi SMOK

## Что работает

- `orders` + `order_items` + задания в `notification_jobs` сохраняются одной PostgreSQL-транзакцией. Изменения существующих `create_guest_order`, цен и idempotency не требуются.
- Checkout отвечает после фиксации заказа. В его API нет вызовов Telegram/SMS, ожидания worker или попыток отправки. Поэтому сбой провайдера не меняет результат checkout.
- Отдельный worker `/api/notification-worker` вызывается Supabase `pg_cron` + `pg_net` каждую минуту. Открытая кухня для отправки не нужна. Платный Vercel Cron не требуется.
- Telegram отправляет ресторану новый заказ: номер, время Europe/Warsaw, получение/доставка, контакт, адрес, все позиции/количества, комментарий, желаемое время, итог и ссылку на защищённый список Orders.
- В Admin → Ustawienia → Powiadomienia: состояние конфигурации, heartbeat worker, последние 10 доставок, фиксированное тестовое сообщение и фактический результат из очереди. «Skonfigurowano» означает наличие корректного формата ENV, а не доказательство валидности токена/чата — для этого нужен тест.
- SMS всегда выключен. Есть контракт `SmsProvider`, пять польских шаблонов и события `order_received`, `order_confirmed`, `order_ready`, `order_cancelled`. `delivery_started` подготовлен в типах/schema/template, но не генерируется: существующая модель не имеет такого статуса; `delivered` не выдаётся за начало доставки.

## Миграции

1. `202609170001_notifications.sql`: jobs, attempts, heartbeat, триггер, claim/finish/test RPC, RLS/grants.
2. `202609170002_notification_scheduler.sql`: extensions, закрытая функция пробуждения worker, cron каждую минуту.

Обе миграции уже применены CLI в облачном Supabase. Старые заказы не удалены и не поставлены в очередь задним числом. Планировщик ничего не отправляет, пока в Vault нет `sushi_notification_worker_secret`.

Не повторять seed, не reset БД. При новых окружениях: `supabase db push --linked`.

## Надёжность и пределы

- Уникальность `(order_id, channel, event)` исключает второе задание при повторном checkout.
- Краткая транзакционная advisory lock и `FOR UPDATE SKIP LOCKED` сериализуют claim; lease UUID не даёт устаревшему worker подтвердить чужую попытку.
- Lease 2 минуты; Telegram timeout 8 секунд; worker ограничен тремя заданиями за вызов. При росте нагрузки нужно увеличить частоту/производительность по измеренному возрасту очереди.
- До 8 попыток; backoff 30 секунд → максимум час. 429 учитывает `retry_after`; 400/401/403/404 повторяются через 15 минут, позволяя восстановиться после исправления ENV или прав бота. 5xx и сетевые ошибки повторяются.
- Исчерпанные попытки остаются `failed` и видны Admin. Они не отправляются бесконечно. Для повторной активации таких заданий разработчик сначала проверяет причину и реальный чат; автоматического массового replay нет.
- Неотправленные задания истекают через 24 часа, тестовые — через 10 минут. Отменённый/завершённый заказ не отправляется как новый. После позднего подключения Telegram возможна отправка ещё актуальных заданий не старше 24 часов; проверить очередь перед активацией.
- Telegram `sendMessage` не принимает наш idempotency key. Если Telegram принял сообщение, но ответ потерялся, либо worker умер до подтверждения в БД, повторная попытка **может продублировать сообщение**. Это доставка с повторными попытками, не гарантия exactly-once. Неизвестный исход отмечается `unknown`/`LEASE_EXPIRED`. Номер заказа одинаковый, сам заказ не дублируется.
- Журнал хранит UUID задания, номер попытки, безопасный код и время. Текст сообщения, полный телефон, токен, сырой Telegram ответ/exception не копируются в журнал. История не удаляется автоматически в этом этапе.

## ENV — только сервер

Существующие `SUPABASE_URL` и `SUPABASE_SECRET_KEY` остаются без изменений.

Новые:

| ENV                          | Назначение                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`         | секрет BotFather                                                                           |
| `TELEGRAM_CHAT_ID`           | ID закрытой группы сотрудников/личного чата                                                |
| `NOTIFICATION_WORKER_SECRET` | случайный секрет 32+ символов; Vercel и Supabase Vault                                     |
| `SITE_URL`                   | необязательный HTTPS origin для ссылки Admin; fallback — текущий основной production-домен |

Ничего из перечисленного не должно иметь `VITE_`. SMS credentials нет. Build guard запрещает notification secrets в public ENV. `.env.local` исключён из Git.

### Единственное действие, требующее Telegram-аккаунта владельца

1. В официальном `@BotFather` создать бота через `/newbot`.
2. Добавить бота в **закрытую** группу сотрудников, разрешить отправку сообщений и написать `/start@имя_бота`. Можно вместо группы открыть личный чат с ботом и нажать Start.
3. Локально выполнить:

```sh
cd ~/Desktop/sushi-smoke
python3 scripts/configure-telegram.py
```

Ввод токена скрыт, chat ID определяется через `getUpdates`; владелец выбирает нужный чат. Значения сохраняются только в `.env.local` с правами 600. Helper не отправляет сообщения, не меняет webhook и не читает/печатает текст переписки. Для уже используемого бота с webhook нужен отдельный согласованный способ определения chat ID; helper webhook не отключает. Не отправлять токен в чат с разработчиком.

## Публикация — только после разрешения владельца

Все нижеперечисленные операции может выполнить агент через CLI, владельцу не нужно копировать SQL/ENV:

```sh
# Проверка локальной конфигурации без изменений production:
node scripts/configure-notifications.mjs
# После разрешения на изменение production secrets:
node scripts/configure-notifications.mjs --production
# Затем согласованные commit/push → дождаться deployment основного проекта.
# После deployment, с разрешением активировать доставку:
node scripts/configure-notifications.mjs --activate-scheduler
```

Helper проверяет linked Vercel project и соответствие Supabase URL linked ref, передаёт ENV через stdin, не выводит секреты. Существующие ENV не перезаписываются; при частичном сбое требуется диагностика CLI. Активация проверяет реальный endpoint с секретом и может отправить ожидающие задания; затем сохраняет секрет в Vault. CLI SQL передаётся через временный файл 600, который удаляется после вызова. Cron SQL содержит лишь вызов функции, без секрета.

После публикации: Admin → Powiadomienia → тест Telegram; дождаться `Wysłano pomyślnie` и увидеть сообщение в нужном чате. Затем один согласованный контрольный Guest Checkout с `TEST — NIE PRZYGOTOWYWAĆ`, проверить запись/Telegram/Admin/Kitchen, отменить заказ. Повторить запрос с тем же idempotency key и проверить отсутствие второго задания. Без credentials нельзя утверждать, что реальная Telegram доставка проверена.

## Security

- Worker принимает только POST с отдельным длинным Bearer secret; не принимает текст или destination.
- Admin endpoint проверяет реальный Supabase `getUser(token)` и активную роль `admin` в БД. Staff/anon не могут читать status или запускать тест.
- Тест — фиксированное сообщение в фиксированный чат; глобальный лимит 1/минуту через PostgreSQL. Клиентский body запрещён.
- Outbox/attempts недоступны anon/authenticated даже для прямого SQL REST. RPC только `service_role`; штатный Admin получает урезанное представление через API.
- Telegram использует plain text без HTML/Markdown parsing, удаляются управляющие символы; отключены link previews. Все 50 допустимых позиций помещаются в 4096 символов за счёт сокращения длинных названий, а не потери позиций.
- Телефон/имя/комментарий отправляются в выбранный рестораном Telegram-чат: доступ только сотрудникам. Это единственная внешняя копия персональных данных, необходимая для запрошенного уведомления.

## Проверки

```sh
npm run test:backend
npm run test:database  # изолированный локальный PostgreSQL 127.0.0.1:55439; НЕ production
npm run test:admin
npm run test:e2e
npm run build
git diff --check
```

Backend provider/API tests используют fixtures, SQL integration — настоящий локальный PostgreSQL. Browser fixtures не выдаются за реальную доставку Telegram.

Документация платформ: [Supabase scheduler + Vault](https://supabase.com/docs/guides/functions/schedule-functions), [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage).

### Результат текущего прохода

- 17 backend-тестов, 22 SQL-теста, 11 Admin browser-тестов и 25 публичных browser-тестов прошли. TypeScript и production build прошли; lint в проекте не настроен.
- Локальный notification API проверен с настоящей Supabase Admin-сессией: GET 200; anon 401; test без конфигурации 409; worker без секрета 401. Заказы и сообщения при этой проверке не создавались.
- Миграции local=remote; cron каждую минуту установлен, worker secret в Vault отсутствует, очередь на момент проверки пуста.
- Production-маршруты доступны после миграций. 451 локальный файл/артефакт проверен на точные значения существующих секретов, совпадений нет.
- Реальная Telegram-доставка проверена в следующем проходе (см. ниже). Активация scheduler и Stage 3 на Vercel ожидают разрешения на production ENV/commit/push/deploy.


### Реальный Telegram QA перед публикацией

- Конфигурация проверена через `getMe`, `getChat`, `getChatMember`; получатель — подтверждённая группа Sushi Smok — Zamówienia. Значения секретов не выведены.
- Для фиксированного Admin-теста в реальной облачной очереди намеренно смоделирован ответ 503 провайдера. Это fault injection, а не реальная недоступность Telegram. Сохранён retry, пауза соблюдена, следующая попытка отправлена реальному Telegram. Журнал: retry → sent, две попытки, одно доставленное сообщение.
- В настоящем браузерном Admin подтверждён результат «Wysłano pomyślnie».
- Контрольный Guest Checkout из локального приложения в облачный Supabase создал **SMOK-100008**, две позиции с количествами 1 и 2, **241 zł**. Задание Telegram создано транзакционно, реальный worker отправил сообщение за одну попытку; receipt и order_items проверены.
- Повторные вызовы worker не изменили число попыток отправленных заданий. Kitchen автоматически обнаружил заказ; статусы new → accepted → preparing → ready → cancelled. Тестовый заказ отменён, аудит сохранён.
- Повторно прошли все 75 тестов: 17 backend, 22 SQL, 11 Admin browser и 25 публичных browser тестов. Production build/TypeScript прошли; git diff --check чистый. Финальный аудит подтвердил cancelled у SMOK-100008, Telegram sent за одну попытку и отсутствие активных Telegram-заданий.
- Сгенерирован новый 256-битный worker secret только локально. `.env.local` имеет права 600 и исключён из Git. Production-переменных Telegram/worker ещё нет, существующие server secrets и VITE_SITE_INDEXABLE сохранены.
- **Production scheduler не активирован, Stage 3 не опубликован.** Реальный тест использовал локальный HTTP worker и облачные Supabase/Telegram; автоматический вызов с Supabase в Vercel проверяется после разрешённого deployment.

Повторный реальный тест (только с явным разрешением на два сообщения и один облачный заказ):

```sh
npm run test:backend
npm run dev -- --port 4175 --strictPort
# В отдельном терминале:
CONFIRM_CLOUD_ADMIN_TEST=true VERIFY_NOTIFICATIONS=true node scripts/verify-admin-cloud.mjs
```

Реальные данные/секреты не пишутся в screenshots/traces. Тест откажется обрабатывать очередь при наличии посторонних активных Telegram-заданий.
