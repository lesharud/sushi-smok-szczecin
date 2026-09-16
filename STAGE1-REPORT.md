# Stage 1 — локальная реализация и проверки

## Реализовано

Guest Checkout → Vercel API → Supabase PostgreSQL RPC. Customer accounts/Auth удалены. Дизайн/CSS и каталог/изображения не изменены. База определяет цены и доступность, сохраняет snapshots позиций и итог в одной транзакции. API не создаёт fake-заказов. При отсутствии Supabase возвращает явную недоступность.

## Проверено

- Production build + TypeScript frontend/backend — успешно.
- 6 серверных тестов: строгая валидация, подмена price/subtotal/total, неверные количества/контакты, размер JSON, origin, безопасные ошибки, отсутствие конфигурации.
- 8 интеграционных тестов на реальной локальной PostgreSQL 14: записи orders/items, несколько товаров/количество >1, актуальные цены, снимки, доставка, unavailable/nonexistent product, атомарный rollback, одновременный повтор, ACL/RLS и upgrade старого scaffold без потери данных.
- 24 браузерных теста: меню/корзина, гостевой checkout, validation/error/retry, очистка только после success, восстановление после reload, отсутствие аккаунтов, мобильные размеры, desktop, accessibility и прежние анимации.
- Проверка production assets с намеренно подставленным тестовым server-secret: значение и серверный код в frontend bundle не попали.
- `git diff --check` — без ошибок. Lint в проекте не настроен.

Браузерные успешные сценарии и SDK transport unit test используют явно обозначенные fixtures только в tests/. SQL integration tests действительно записывали строки в локальную PostgreSQL. Это разные уровни проверки, не доказательство работы облачного Supabase.

## Не проверено

Полный браузерный сценарий через API с облачной БД и Vercel deployment пока не проверены. Не выполнялись push, deployment или новые коммиты.

## Облачная проверка — 16 сентября 2026

Владелец применил миграцию и seed. Сервер использует актуальный `SUPABASE_SECRET_KEY` (`sb_secret_...`), с fallback на прежний `SUPABASE_SERVICE_ROLE_KEY`. Локальный `.env.local` исключён из Git и имеет права 600.

`CONFIRM_TEST_ORDER=true npm run verify:order` успешно выполнил реальный облачный RPC и прочитал сохранённые orders/order_items: заказ **SMOK-100001**, две позиции с количеством 1 и 2, subtotal и total **24100 groszy (241 zł)**, исходный статус `new`. Повторный запрос с тем же ключом вернул тот же заказ. После проверки тестовый заказ помечен `cancelled`, записи сохранены для аудита. Это подтверждает облачную запись через RPC, но не заменяет проверку браузера и Vercel API.

## Подключение

Supabase подключён локально по [BACKEND.md](BACKEND.md). Для будущего deployment нужны server-only `SUPABASE_URL` и `SUPABASE_SECRET_KEY` в Vercel; секрет нельзя передавать в чат или задавать через `VITE_*`. Push и deployment требуют разрешения владельца.

Доставка отключена до подтверждения тарифа/зоны. Уведомления, оплата и Restaurant Admin не входят в этап. Перед Этапом 2 нужно закрыть облачную end-to-end проверку.

## Git status / изменённые и новые файлы

M — изменён, D — удалён, ?? — новый. Старый SQL перемещён в supabase/legacy, а не потерян. Этот отчёт добавлен после снятия статуса.

```text
 M .env.example
 M .gitignore
 M BACKEND.md
 M DEPLOY-VERCEL.md
 M PRELAUNCH.md
 M README.md
 M package-lock.json
 M package.json
 M playwright.config.ts
 M scripts/prerender.mjs
 M src/Root.tsx
 D src/pages/Account.tsx
 M src/pages/Cart.tsx
 M src/pages/Checkout.tsx
 M src/pages/Menu.tsx
 M src/shop/Shell.tsx
 M src/shop/ShopProvider.tsx
 D src/shop/auth.tsx
 M src/shop/catalog.ts
 M src/shop/components.tsx
 D src/shop/formValidation.ts
 M src/shop/orders.ts
 M src/shop/types.ts
 D supabase/migrations/202609140001_restaurant.sql
 M tests/shop.spec.ts
 M vercel.json
 M vite.config.ts
?? api/order-receipt.ts
?? api/order-settings.ts
?? api/orders.ts
?? scripts/verify-order.mjs
?? server/orders.ts
?? server/validation.ts
?? server/vite-api.ts
?? supabase/legacy/202609140001_restaurant.sql
?? supabase/migrations/202609150001_guest_orders.sql
?? tests/backend/api.test.mjs
?? tests/database/orders.test.mjs
?? tests/guest-api-fixture.ts
?? tests/guest-checkout.spec.ts
?? tsconfig.server.json
?? STAGE1-REPORT.md
```
