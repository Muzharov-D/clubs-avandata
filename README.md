# Clubs Avandata — Multi-Tenant Sports Platform

SaaS-платформа для футбольных клубов на базе мульти-тенантной архитектуры.
Поднимает кабинет клуба (тренеры + игроки) и публичный экран родителей за час.

**Домен**: `clubs.avandata.ru`

## Стек

- **Backend**: TypeScript + Fastify 5 + Drizzle ORM + Postgres
- **Frontend**: TypeScript + React 19 + Vite + TanStack Query + React Router 7
- **Auth**: JWT (access 15 мин) + refresh (30 дн, HttpOnly cookie, rotation)
- **Tenant**: shared DB + RLS, tenant_id из JWT после login
- **Hosting**: Render (BE + PG) + Vercel (FE) + Cloudflare DNS

## Архитектура

См. `MULTI_TENANT_BLUEPRINT.md` — полный design-doc.

### Roles

```
platform_admin → head_coach → team_coach → player
                                       parent (anonymous public)
```

### Tenant resolution

Логин на `clubs.avandata.ru/login` → JWT с `tenantId` →
все последующие запросы scoped через `app.tenant_id` (Postgres RLS).

Публичный экран родителей: `clubs.avandata.ru/m/{slug}/...` (без auth).

## Структура

```
backend/    Fastify + Drizzle, src/server.ts entry
frontend/   Vite + React, src/main.tsx entry
docs/       MULTI_TENANT_BLUEPRINT.md и др.
```

## Local development

### Backend

```bash
cd backend
npm install
cp .env.example .env   # заполнить DATABASE_URL, JWT_SECRET
npm run db:migrate
npm run dev
```

Сервер на `http://localhost:4000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dev-сервер на `http://localhost:5173`, проксирует `/api/*` → backend.

## Deployment

- `main` push → Render auto-deploy backend (webhook)
- `main` push → Vercel auto-deploy frontend
- DB-миграции: `npm run db:migrate` в Render build step
