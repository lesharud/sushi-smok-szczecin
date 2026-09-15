# Публикация текущей версии через GitHub + Vercel

Дизайн и бизнес-логика не изменены. Заказы остаются демонстрационными: публикация frontend не подключает ресторан и оплату.

## Первый push

В текущей папке Git пока не инициализирован. Создайте пустой репозиторий `sushi-smok` на GitHub без автоматически добавленных README, лицензии и .gitignore. Затем выполните, заменив `YOUR_GITHUB_LOGIN` своим логином:

```sh
cd /Users/adm/Desktop/sushi-smoke
git init -b main
git add .
git status --short
git commit -m "Prepare Sushi Smok for Vercel deployment"
git remote add origin https://github.com/YOUR_GITHUB_LOGIN/sushi-smok.git
git push -u origin main
```

Если вы уже выполнили `git init`, не повторяйте его и проверяйте `git remote -v` перед добавлением origin. Авторизация GitHub происходит через credential manager или SSH; токены нельзя вставлять в remote URL. Исходники и локальные изображения идут в репозиторий, `dist`, зависимости, `.env*`, `.vercel` и приватные ключи исключены. Пустой `.env.example` намеренно включён.

## Импорт в Vercel

1. В Vercel выберите Add New → Project → Import Git Repository и репозиторий `sushi-smok`.
2. Root Directory — корень репозитория. Framework — Vite. Node.js — 22.x.
3. Настройки уже записаны в `vercel.json`: установка `npm ci`, сборка `npm run build`, Output Directory `dist`.
4. Нажмите Deploy. Полученный адрес `https://….vercel.app` — публичная ссылка. Если включена Deployment Protection, отключите требование входа для ссылки, которую отдаёте клиенту.
5. Проверьте прямое открытие и обновление `/menu`, `/cart`, `/checkout`, `/menu/danie/` с существующим slug. Добавьте товар и пройдите тестовый checkout.

Предварительно созданные HTML и реальные assets обслуживаются как файлы. Для остальных адресов rewrite возвращает `app.html`, после чего React Router открывает соответствующую страницу. Неизвестный маршрут показывает существующую страницу ошибки приложения. Netlify-файлы не настраивают маршрутизацию Vercel; для него используется `vercel.json`.

## Environment variables

**Для текущей демонстрационной версии обязательных переменных нет.**

| Переменная | Для первого deployment |
|---|---|
| `VITE_SITE_INDEXABLE` | Рекомендуется `false` для Production и Preview. Сайт доступен по публичной ссылке, но просит поисковики не индексировать его |
| `SITE_URL` | Можно оставить незаданной. После получения постоянного адреса добавить `https://имя.vercel.app` или согласованный домен и выполнить Redeploy для canonical/OG |
| `VITE_SUPABASE_URL` | Не нужна для текущего demo; только для подключения Supabase Auth |
| `VITE_SUPABASE_ANON_KEY` | Не нужна для текущего demo; только публичный anon-ключ при подключении Auth |

`VITE_SITE_INDEXABLE=true` требует корректного HTTPS `SITE_URL`; до окончательного согласования запуска оставьте `false`. Переменные `VITE_*` попадают в браузерный bundle: service-role, платёжные и другие приватные ключи здесь запрещены. Изменение переменных требует новой сборки. Все credentials настраиваются в панели Vercel, не в GitHub-файлах.

## Последующие изменения

```sh
git add .
git commit -m "Update Sushi Smok"
git push
```

Подключённый GitHub-репозиторий позволяет Vercel собирать следующие изменения. Публичный deployment в ходе подготовки не выполнялся; адрес появится после импорта и Deploy в вашем аккаунте.

Официальная документация: https://vercel.com/docs/frameworks/frontend/vite и https://vercel.com/docs/project-configuration/vercel-json.
