# Backend — Stage 1: Guest Checkout

## Текущая реализация

Menu → Cart → Guest Checkout → `POST /api/orders` → Supabase RPC `create_guest_order` → order confirmation.

Код не содержит demo-adapter. Успешный ответ возможен только после успешного RPC. Без настроенного Supabase API возвращает 503 с польским сообщением; корзина не очищается. Покупатель не регистрируется. Удалены AuthProvider, страницы login/register/profile/history и ссылки на них. Старые customer routes показывают существующую 404.

## Одно необходимое следующее действие: подключить свой Supabase

Ниже точная последовательность внутри одного подключения. Не отправляйте ключи в чат.

1. Выберите/создайте проект Supabase под контролем владельца.
2. В **SQL Editor** выполните `supabase/migrations/202609150001_guest_orders.sql`, затем `supabase/seed.sql`. Это создаст схему и перенесёт существующий каталог. Не выполняйте файлы `supabase/legacy/`: это исторический scaffold. Если он уже применялся раньше, новая миграция адаптирует его orders/products, закрывает доступ customer-ролей к profiles/addresses и не удаляет их данные.
3. В Supabase **Project Settings → API / API Keys** найдите Project URL и серверный Secret key (`sb_secret_…`). Создайте локальный `.env.local` по `.env.example` и заполните два значения. Вставляйте ключ через редактор, не через команду, которая сохранится в shell history.
4. Передайте агенту только сообщение «Supabase подключён». Он сможет проверить реальную запись через `CONFIRM_TEST_ORDER=true npm run verify:order`. Никакого production deployment для локальной проверки не нужно.

| Переменная                  | Тип                                                  | Где нужна                                                          |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `SUPABASE_URL`              | URL проекта, не секрет; используется только сервером | `.env.local`; позже Vercel Preview/Production                      |
| `SUPABASE_SECRET_KEY` | Секрет с привилегиями сервера                        | `.env.local`; позже Vercel Environment Variables, никогда `VITE_*` |
| `SITE_URL`                  | Публичный домен для SEO, необязателен                | При необходимости локально/Vercel                                  |
| `VITE_SITE_INDEXABLE`       | Публичный флаг, для demo `false`                     | Локально/Vercel                                                    |

`VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` больше не нужны. Удалите их из Vercel при следующем согласованном deployment. Новая версия использует только серверные значения.

## Таблицы и functions

- `categories`, `products`: сохранены текущие text ID/slug/категории, цены в целых грошах, availability, фото, происхождение данных, timestamps.
- `orders`: UUID внутри, последовательный уникальный `SMOK-100001` снаружи; статус `new`; имя/телефон; адрес только для доставки; комментарий/время; рассчитанные subtotal/fee/total; timestamps; хеш токена подтверждения и хеш запроса для idempotency.
- `order_items`: product ID и snapshots name, quantity, unit price, image; вычисляемый line total. Изменение products не меняет snapshots.
- `order_settings`: общий выключатель приёма, delivery_enabled и подтверждённый тариф в грошах. Начально самовывоз включён, доставка выключена, тариф null.
- `create_guest_order(uuid,text,jsonb)`: проверка, блокировки, расчёт и запись всех строк в одной транзакции.
- `get_guest_order(uuid,text)`: чтение только по ключу попытки + хешу случайного токена. Возвращает номер, статусы, позиции и суммы, **без имени, телефона и адреса**.
- `touch_updated_at`: обновление timestamps.

Статусы: `new`, `accepted`, `preparing`, `ready`, `delivered`, `cancelled`. Управление статусами сотрудниками — следующий этап. Поля payment_method/payment_status пока содержат unconfirmed/unpaid; оплата не интегрирована.

## Проверки и безопасность

1. API принимает только JSON до 16 KB. Строгий allowlist полей: price/subtotal/total в запросе отвергаются.
2. Только product IDs и целые quantities 1–99, не больше 50 уникальных строк / 200 порций; дубликаты ID запрещены.
3. Имя/телефон/адрес/время/длина комментария проверяются на сервере; SQL независимо проверяет структуру и ключевые ограничения.
4. SQL получает цены/availability из products под блокировкой; вычисляет суммы в целых грошах. Доставка берётся из order_settings, самовывоз 0 как в исходном flow.
5. Одна транзакция создаёт orders и order_items. Ошибка любой позиции откатывает заказ.
6. Advisory lock + unique idempotency_key предотвращают дубли параллельных запросов. Повтор возвращает первоначальные snapshots. Изменённые данные с тем же ключом дают конфликт.
7. RLS включён. anon/authenticated не могут читать orders/items/settings, писать products или выполнять RPC. RPC доступны только service_role; search_path пустой.
8. Для подтверждения требуется случайный 256-bit токен. В базе хранится только SHA-256. Номер заказа и UUID сами по себе доступа не дают.
9. Ответы не кешируются; SQL/секретные ошибки не возвращаются клиенту. Контактные данные и секреты не логируются кодом API.
10. Общий лимит — до 5 новых заказов на телефон за 15 минут; повтор уже записанного заказа разрешён. Это базовое ограничение, не полноценная anti-bot защита: для широкого запуска потребуется WAF/rate limiting на инфраструктуре.

## Ошибки и повтор

Во время submit кнопка/поля блокируются. При неизвестном результате сети тот же запрос и ключ сохраняются в sessionStorage до завершения попытки или закрытия вкладки. Это временный retry-draft с контактами, не аккаунт и не история. После успеха draft удаляется; остаётся только токен последнего подтверждения. Старые локальные demo-профиль/история удаляются при запуске новой версии.

При definitive validation error поля снова доступны. При сетевой/серверной неопределённости повтор отправляет прежние данные: сначала нужно выяснить результат, а не создавать новый заказ. Корзина очищается только по успешному ответу, и только в объёме отправленных позиций — добавленные во время запроса товары не теряются.

## Каталог и доставка

Frontend читает прежний dataset для сохранения prerender, изображений и UI. Database авторитетна при заказе. Seed использует `on conflict do nothing`, поэтому его повтор не перезаписывает правки владельца. Меняя цены для продажи, обновляйте также dataset и делайте согласованный rebuild. В checkout указано, что окончательные цены проверяются сервером.

Доставку включать только после подтверждения тарифа и зоны владельцем. В Table Editor `order_settings`: задать `delivery_fee_grosz`, затем `delivery_enabled=true`. Значение тарифа не придумано. В этом этапе нет геокодинга/автоматической проверки зоны доставки.

## Локальная проверка SQL

Отдельный кластер (не рабочая база):

```sh
initdb -D /tmp/sushi-smok-stage1-pg -A trust -U postgres --no-locale --encoding=UTF8
pg_ctl -D /tmp/sushi-smok-stage1-pg -l /tmp/sushi-smok-stage1-pg.log -o '-p 55439 -h 127.0.0.1 -k /tmp' start
psql -X -h 127.0.0.1 -p 55439 -U postgres -d postgres -c 'create role anon; create role authenticated; create role service_role bypassrls;'
psql -X -h 127.0.0.1 -p 55439 -U postgres -d postgres -c 'create database smok_stage1_test;'
npm run test:database
pg_ctl -D /tmp/sushi-smok-stage1-pg stop
```

Если кластер уже создан, пропустить initdb и создание ролей/БД. Тесты намеренно пересоздают public только в этой фиксированной локальной БД. Не хранить в ней рабочие данные.

## Проверка облачного Supabase

```sh
CONFIRM_TEST_ORDER=true npm run verify:order
```

Скрипт создаёт один реальный заказ с пометкой «TEST INTEGRACYJNY — NIE PRZYGOTOWYWAĆ», читает orders/items, сверяет цены, количества, суммы и idempotency, затем помечает его cancelled. Не удаляет след проверки. Секреты и PII не печатает. Выполнять только в согласованном проекте. После этого проверить живой `/api/orders` локально через `npm run dev`, затем отдельно — на согласованном Vercel preview.

## Vercel / границы этапа

Файлы `api/*.ts` — serverless handlers; `server/*` никогда не импортируются клиентским entrypoint. Добавлен API rewrite, SPA fallback сохранён. Build проверяет TS frontend и backend. В dev/preview используется тот же handler через Vite middleware, без отдельного fake backend.

Push в main и deployment не выполнялись. Для публикации потребуется ваше отдельное разрешение. До подключения и проверки облачного Supabase этап нельзя считать полностью проверенным end-to-end. После записи в БД нет автоматического оповещения кухни: оператор видит orders только в Supabase. Restaurant Admin/Kitchen — Stage 2.

## Безопасная запись актуального secret key

```sh
cd /Users/adm/Desktop/sushi-smoke
python3 scripts/configure-supabase-env.py
```

Ввести Project URL, затем вставить secret key в скрытый запрос. Скрипт сохраняет остальные переменные, устанавливает права 600 и не выводит секрет. `SUPABASE_SECRET_KEY` имеет приоритет; старый `SUPABASE_SERVICE_ROLE_KEY` поддерживается только как fallback. Миграцию повторять из-за смены типа ключа не нужно: secret key использует ту же серверную роль PostgreSQL. После изменения env перезапустить локальный Vite.
