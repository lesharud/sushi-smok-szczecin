# Sushi Smok — Guest Checkout + Restaurant Admin

React + Vite + TypeScript; серверные Vercel Functions и Supabase PostgreSQL. Дизайн сохранён. Покупатели оформляют заказ без аккаунта, регистрации и истории заказов.

## Запуск

Node.js 22.x.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Vite dev и preview подключают те же обработчики API через server-only middleware. Vercel автоматически обслуживает файлы `api/`. Для реальных заказов требуется настройка из [BACKEND.md](BACKEND.md); без неё сервер отвечает ошибкой недоступности, а не создаёт demo-заказ.

## Архитектура

- `src/shop/catalog.json` — существующие 68 продуктов и 16 категорий для отображения. Фото и данные сохранены.
- `src/shop/ShopProvider.tsx` — корзина в localStorage. Удаляет из корзины только успешно заказанные количества.
- `src/pages/Checkout.tsx` — имя, телефон, самовывоз/доставка, необязательные комментарий и время.
- `src/shop/orders.ts` — HTTP-клиент, повтор отправки с тем же ключом, защищённое чтение подтверждения.
- `api/` — создание заказа, чтение подтверждения и настроек заказа.
- `server/` — server-side validation, Supabase SDK и обработка ошибок.
- `supabase/migrations/202609150001_guest_orders.sql` — схема и атомарные RPC.
- `supabase/seed.sql` — исходный каталог. Повторный seed не перезаписывает изменения владельца.

Supabase — источник истины для цен и availability при оформлении. Публичный интерфейс и prerender начинают с локального каталога; браузер обновляет редактируемые поля из `/api/catalog` каждые 15 секунд. Рабочие цены и доступность меняются через Admin. Локальный dataset остаётся исходным снимком и fallback; старые заказы используют собственные snapshots.

## Настройки

Скопировать `.env.example` в `.env.local`, заполнить `SUPABASE_URL` и **секретный** `SUPABASE_SECRET_KEY`. Оба используются только сервером. Не использовать префикс `VITE_` для ключа. Серверный ключ не попадает в браузер. Отдельный лениво загружаемый Admin использует Supabase Auth/SDK с публичными `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`; настройка описана в [ADMIN.md](ADMIN.md).

`SITE_URL` нужен для canonical/OG; `VITE_SITE_INDEXABLE=false` оставляет демонстрационную ссылку вне индексации. Настройка hosting — [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md).

## Редактирование

Цена в `priceGrosz`: 3900 = 39 zł. ID сохранять стабильным. Файлы изображений — `public/images`, путь в `image`. Контакты — `src/data.ts`; Restaurant JSON-LD — `scripts/prerender.mjs`. Импортированный каталог не является подтверждением актуальных прямых цен владельцем: см. `SOURCES.md`.

`node scripts/seed-catalog.mjs` обновляет SQL-снимок из dataset. Перед реальным приёмом заказов подтвердить цены, наличие и условия у владельца. Доставка по умолчанию выключена: тариф не известен и не придуман. Включается в Admin → Ustawienia после подтверждения тарифа и области обслуживания.

## Проверки

```sh
npm run test:backend
npm run test:e2e
npm run test:admin
npm run build
```

SQL integration tests: `npm run test:database` — только отдельный локальный PostgreSQL на 127.0.0.1:55439, БД `smok_stage1_test` и `smok_stage2_test`. Тесты пересоздают public-схему **этой тестовой БД**; не используйте её для рабочих данных. Роли anon/authenticated/service_role должны существовать. Подробности в BACKEND.md.

Проверка реального Supabase после настройки: `CONFIRM_TEST_ORDER=true npm run verify:order`. Создаётся один явно отмеченный тестовый заказ, проверяются строки orders/order_items и повтор с тем же ключом; затем заказ помечается cancelled. Секреты и контактные данные не выводятся.

## Ограничения этапа

Платежи, email/SMS и customer accounts не реализованы. Успех Guest Checkout означает запись в базу, а не начало приготовления. Restaurant Admin/Kitchen реализован локально и требует отдельного подключения по ADMIN.md; до этого оператор видит заказы в Supabase Table Editor.

Тесты SQL действительно записывают данные в локальную PostgreSQL. Браузерные успешные сценарии используют явно обозначенные fixtures; они не доказывают соединение с вашим облачным Supabase. Cloud verification требует ваших credentials и применённой миграции.

## Restaurant Admin / Kitchen — Этап 2

Локальная реализация, настройка ролей, миграция и создание первого Admin описаны в [ADMIN.md](ADMIN.md). Перед публикацией нужно применить новую миграцию, создать сотрудника и добавить публичные ENV для Supabase Auth. Guest Checkout остаётся без аккаунтов.

## Stage 3: уведомления

Архитектура очереди, Telegram, отключённый SMS, настройка и публикация: [NOTIFICATIONS.md](NOTIFICATIONS.md).
