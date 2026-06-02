# E2E-тесты (Playwright)

Гоняются против **живого деплоя** (`E2E_BASE_URL`, по умолчанию
`https://clubs-avandata.vercel.app`) — локальный сервер не поднимается.

## Запуск

```bash
cd frontend
cp tests/e2e/.env.e2e.example tests/e2e/.env.e2e   # заполнить учётки
npm run test:e2e            # все тесты (chromium + mobile-chrome)
npm run test:e2e -- smoke.spec.ts          # только smoke
npm run test:e2e:ui         # интерактивный UI-режим
npm run test:e2e:report     # открыть HTML-отчёт
```

## Учётки

`tests/e2e/.env.e2e` (в `.gitignore`, не коммитится):

| Переменная | Для чего |
|---|---|
| `E2E_ADMIN_USERNAME/PASSWORD` | platform_admin → admin-тесты (список/создание/удаление клуба) |
| `E2E_COACH_USERNAME/PASSWORD` | head_coach → дашборд и навигация кабинета |
| `E2E_PLAYER_USERNAME/PASSWORD` | (опц.) игрок |

Без учёток auth-зависимые describe помечаются `skip`; smoke и публичный
экран работают всегда.

## Структура

```
tests/e2e/
├── fixtures/
│   ├── env.ts        — загрузка .env.e2e (без dotenv), BASE_URL/PUBLIC_*
│   └── auth.ts       — getCreds(role) + loginViaUI() + readAccessToken()
├── smoke.spec.ts     — публичные экраны открываются (без auth)
├── public/parent.spec.ts   — /m/{slug}/team/{age} без auth
├── auth/login.spec.ts      — вход admin/coach + ошибка на неверных
├── coach/
│   ├── dashboard.spec.ts    — /club рендерится
│   └── navigation.spec.ts   — переходы по разделам кабинета
└── admin/tenants.spec.ts    — write-флоу: создать → в списке → войти → удалить
```

## Селекторы

- `data-testid` на ключевых узлах (форма входа, дашборд, admin-форма/список).
- Навигация — `[data-nav-id="..."]` (уже было в `SidebarNav`).

## Write-флоу и чистка прода

`admin/tenants.spec.ts` создаёт реальный клуб со slug `e2e-xxxxxx` и удаляет его
в `afterEach`:

1. жёсткий `DELETE /api/v1/admin/tenants/:slug?confirm=:slug` (новый эндпоинт);
2. фолбэк `PATCH status=archived`, если DELETE ещё не задеплоен на прод-бэк.

> ⚠️ Полная чистка через DELETE заработает только после деплоя бэкенда с новым
> эндпоинтом. До этого тестовый клуб будет архивироваться (скрываться), а не
> удаляться.
