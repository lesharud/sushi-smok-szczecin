# Разрешение на публикацию Stage 2

Владелец разрешил добавление двух PUBLIC Production ENV, commit/push main и автоматический deployment правильного проекта sushi-smok-szczecin. VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY добавлены из локальных значений через CLI. Server secrets и VITE_SITE_INDEXABLE не менялись. Ниже сохранена история проверок до публикации; окончательный production smoke test выполняется после deployment.

# Этап 2 — актуальный результат облачной проверки

## Выполнено после настройки CLI

- Подтверждены linked Supabase/Vercel и совпадение local/remote обеих миграций. Миграции повторно не применялись.
- Единственному существующему подтверждённому Auth user назначен admin через SQL/CLI. Пароль не менялся; публичная регистрация отключена.
- Публичные Auth ENV получены CLI и сохранены локально. Добавление в Vercel Production ожидает отдельного подтверждения владельца.
- Реальная Auth-сессия получена через одноразовый токен существующего пользователя без письма. Проверены RLS, экраны Orders/Kitchen/Menu/Settings, отказ при неправильном пароле, refresh/logout.
- Локальный браузер → реальный Guest API → облачный Supabase: **SMOK-100005**, две позиции (1 и 2), **241 zł**. Карточка появилась в Kitchen автоматически. Статусы new → accepted → preparing → ready → cancelled, позиции/суммы/очистка корзины проверены, 0 browser runtime errors.
- Первый прогон создал тестовый заказ, но остановился на слишком строгом тестовом селекторе заголовка. Этот заказ отменён, селектор исправлен; повторный прогон успешен.
- Cloud SQL проверил фактические изменения product/settings и права staff/revoked внутри транзакции с ROLLBACK. Бизнес-значения не изменились.
- Build + TypeScript, 8 server tests, 10 Admin browser regression tests прошли повторно. Предыдущие 16 локальных SQL и 25 public UI проверок описаны ниже. Секреты в текущих файлах для Git и dist не обнаружены; .env.local имеет права 600. CLI cache supabase/.temp исключён из Git.

## Осталось перед публикацией

1. Подтверждение двух публичных Production ENV и их добавление CLI.
2. Отдельное разрешение на commit/push main и deployment.
3. После публикации — вход существующим правильным паролем и короткий production smoke test. Правильный пароль владельца не передавался агенту и не проверялся; настоящая Auth-сессия/RLS проверены другим штатным способом.

Production-код не менялся, push/deployment не выполнялись. Без согласованных ENV и deployment публичный Admin не считается опубликованным. Инструкции: [ADMIN.md](ADMIN.md).

---

## Предыдущий локальный этап (исторический отчёт)

# Этап 2 — локальная реализация Restaurant Admin / Kitchen

## Состояние

Работа начата с чистого `main`, коммит `b37a04d` (опубликованный Этап 1). Новых коммитов, push, deployment, изменений облачной schema или создания Auth-пользователей в этом этапе не выполнялось.

Admin реализован; облачное end-to-end подтверждение требует действий владельца из [ADMIN.md](ADMIN.md). Не выдаём локальные SQL-тесты и браузерные fixtures за проверку облачного Auth.

## Реализовано

- `/admin/login`, `/admin`, `/admin/orders`, `/admin/kitchen`, `/admin/menu`, `/admin/settings`.
- Supabase Auth email/password только для сотрудников, без публичной регистрации. Восстановление/обновление/истечение сессии, logout.
- Роли admin/staff через staff_profiles; RLS и защищённые RPC, отзыв роли active=false. Чтение orders ограничено нужными столбцами без receipt/idempotency hashes.
- Заказы: snapshots, контакты, адрес, время, комментарии, суммы, фильтры/история, последовательные статусы, подтверждение отмены, журнал переходов. Защита от конкурентных изменений.
- Кухня: крупные карточки, количества блюд, заметные комментарии, три колонки, быстрые действия. Реальное обновление запросами каждые 5 секунд с восстановлением после ошибок; не WebSocket Realtime и не simulation.
- Admin меню: поиск/категория, доступность, название/описание/цена/категория; публичные карточки обновляются каждые 15 секунд через безопасный API без redesign. Известные недоступные позиции блокируются в checkout; повтор неопределённого старого запроса сохраняет прежнюю идемпотентность.
- Настройки: приём заказов, доставка, подтверждённый тариф. Нет выдуманных тарифов или новых business facts. Доставка миграцией не включается.
- Отдельный ленивый Admin bundle; публичный CSS, изображения и dataset не изменены. Customer accounts не добавлены, Guest RPC Этапа 1 не изменены.
- Защита build от server secrets в VITE_*.

## База

Добавочная транзакционная миграция `supabase/migrations/202609160001_restaurant_admin.sql`:

- staff_profiles, order_status_events, индексы;
- staff_role, staff_change_order_status, admin_update_product, admin_update_settings;
- grants/RLS + restrictive guards от обхода через старые permissive policies.

Существующие заказы и products не удаляются/не пересоздаются. Seed и миграцию Этапа 1 повторять не нужно.

## Реальные проверки

- 16 SQL integration tests на реальном локальном PostgreSQL: Этап 1 + Этап 2. В том числе настоящий order/order_items insert, статусы и аудит, запреты anon/nonstaff, ограничение staff, отзыв доступа, попытка обхода старой permissive policy, snapshots и серверные цены, unavailable, атомарность.
- 8 server tests: валидация, API contract, безопасные ошибки, публичный catalog allowlist, guard секретов. Сетевой транспорт SDK здесь fixture.
- 10 Admin браузерных контрактных тестов: login/wrong password/logout/refresh/expiry/revocation, роли, детали/статусы/отмена, polling/reconnect, меню/настройки, desktop 1440, tablet 1024×768 / 768×1024 и mobile 390×844. Screenshots осмотрены. Auth/сеть в этих тестах явно подменены только в tests/.
- 25 уникальных тестов публичного UI/Guest Checkout проверены: первоначально 24 прошли, в новом тесте был исправлен JSON import; повторный запуск всех 4 guest-checkout tests прошёл. Включены live price/availability, защита повторной отправки, mobile, overflow, accessibility, картинки, анимации и footer.
- Production build + frontend/backend TypeScript прошли. Отдельно собрана конфигурация с публичным тестовым ENV для полного Admin bundle; значения реального серверного секрета в 230 production-файлах не обнаружены. После проверки восстановлена обычная сборка без тестового ENV.
- `.env.local` игнорируется Git; значения секретов не найдены в файлах для коммита. `git diff --check` чистый. Lint не настроен.

## Не проверено / следующий шаг

Облачная миграция Этапа 2, реальный login сотрудника, облачные изменения меню/статусов и production Admin E2E не выполнялись. Сначала разрешение владельца, затем migration → Auth user + staff_profile → public ENV → локальная облачная проверка → согласованный commit/push → production test. Адрес проекта: sushi-smok-szczecin (без суффикса ovpw).

Полные действия, SQL bootstrap и checklist: [ADMIN.md](ADMIN.md).

## Git status / файлы

Ниже снимок локальных изменений; M — изменён, ?? — новый. Код и документы готовы к review, но не staged/committed.

```text
 M .env.example
 M BACKEND.md
 M README.md
 M package.json
 M playwright.config.ts
 M server/vite-api.ts
 M src/Root.tsx
 M src/home/MenuSections.tsx
 M src/pages/Checkout.tsx
 M src/pages/Menu.tsx
 M src/shop/components.tsx
 M tests/backend/api.test.mjs
 M tests/guest-api-fixture.ts
 M tests/guest-checkout.spec.ts
 M vite.config.ts
?? ADMIN.md
?? STAGE2-REPORT.md
?? api/catalog.ts
?? playwright.admin.config.ts
?? server/catalog.ts
?? server/public-env.ts
?? src/admin/Admin.tsx
?? src/admin/Menu.tsx
?? src/admin/Orders.tsx
?? src/admin/Settings.tsx
?? src/admin/admin.css
?? src/admin/client.ts
?? src/admin/types.ts
?? src/admin/useResource.ts
?? src/shop/liveCatalog.ts
?? supabase/migrations/202609160001_restaurant_admin.sql
?? tests/admin-fixture.ts
?? tests/admin.spec.ts
?? tests/database/admin.test.mjs
```

## Итог текущего прохода

Повторная регрессия Guest Checkout: 4/4 успешно. Production главная, menu, cart, checkout и API настроек: HTTP 200. Production ENV не изменены — подтверждение ещё не получено. git diff --check без ошибок.

Актуальный git status:

```text
 M .env.example
 M .gitignore
 M BACKEND.md
 M README.md
 M package.json
 M playwright.config.ts
 M server/vite-api.ts
 M src/Root.tsx
 M src/home/MenuSections.tsx
 M src/pages/Checkout.tsx
 M src/pages/Menu.tsx
 M src/shop/components.tsx
 M tests/backend/api.test.mjs
 M tests/guest-api-fixture.ts
 M tests/guest-checkout.spec.ts
 M vite.config.ts
?? ADMIN.md
?? STAGE2-REPORT.md
?? api/catalog.ts
?? playwright.admin.config.ts
?? scripts/bootstrap-admin.sql
?? scripts/configure-admin-env.mjs
?? scripts/verify-admin-cloud.mjs
?? scripts/verify-admin-rollback.sql
?? server/catalog.ts
?? server/public-env.ts
?? src/admin/Admin.tsx
?? src/admin/Menu.tsx
?? src/admin/Orders.tsx
?? src/admin/Settings.tsx
?? src/admin/admin.css
?? src/admin/client.ts
?? src/admin/types.ts
?? src/admin/useResource.ts
?? src/shop/liveCatalog.ts
?? supabase/migrations/202609160001_restaurant_admin.sql
?? tests/admin-fixture.ts
?? tests/admin.spec.ts
?? tests/database/admin.test.mjs
```
