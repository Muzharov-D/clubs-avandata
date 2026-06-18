import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { env } from './env.js';
import { logger } from './shared/logger.js';
import { AppError } from './shared/errors.js';
import { authRoutes } from './auth/routes.js';
import { tenantRoutes } from './tenants/routes.js';
import { adminRoutes } from './admin/routes.js';
import { publicRoutes } from './public/routes.js';
import { uploadRoutes } from './upload/routes.js';
import { dataRoutes } from './data/routes.js';
import { trainingsRoutes } from './trainings/routes.js';
import { callupsRoutes } from './callups/routes.js';
import { dashboardRoutes } from './dashboard/routes.js';
import { federationRoutes } from './federation/routes.js';
import { videoRoutes } from './modules/video/routes.js';
import { closePool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { startCrons, stopCrons } from './cron/runner.js';
import { captureSnapshotIfDue } from './federation/snapshots.js';

async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: false,
    trustProxy: true,
  });

  // Production origins захардкожены — не зависят от env, чтобы deploy не падал
  // из-за пропущенной переменной. env.CORS_ORIGIN добавляет dev / preview-домены.
  const PROD_ORIGINS = [
    'https://clubs-avandata.vercel.app',
    'https://clubs.avandata.ru',
    'http://localhost:5173',
  ];
  const envOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  const allowedOrigins = Array.from(new Set([...PROD_ORIGINS, ...envOrigins]));
  await app.register(cors, {
    // Функция-резолвер вместо массива: пускаем известные origin'ы + Vercel
    // preview deployments (*.vercel.app для нашего проекта).
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);  // server-to-server / curl
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (/^https:\/\/clubs-avandata-[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
      cb(new Error('CORS: origin не разрешён'), false);
    },
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.REFRESH_TOKEN_SECRET,
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({ error: err.message, code: err.code });
      return;
    }
    logger.error({ err }, 'Unhandled error');
    reply.status(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => ({ status: 'ok', env: env.NODE_ENV }));

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(tenantRoutes, { prefix: '/api/v1/tenant' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(dataRoutes, { prefix: '/api/v1/data' });
  await app.register(publicRoutes, { prefix: '/api/v1/public' });
  await app.register(uploadRoutes, { prefix: '/api/v1' });
  await app.register(trainingsRoutes, { prefix: '/api/v1' });
  await app.register(callupsRoutes, { prefix: '/api/v1' });
  await app.register(dashboardRoutes, { prefix: '/api/v1' });
  await app.register(federationRoutes, { prefix: '/api/v1/federation' });
  await app.register(videoRoutes, { prefix: '/api/v1' });

  return app;
}

async function start() {
  // Самомиграция на старте — гарантирует, что схема БД соответствует коду,
  // даже если хостинг запускает сервис в обход Dockerfile CMD (Render dashboard
  // start command). Не стартуем сервер с рассинхроном схемы.
  try {
    await runMigrations();
  } catch (err) {
    logger.error({ err }, 'Startup migrations failed — refusing to start with schema drift');
    process.exit(1);
  }

  const app = await buildServer();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    try {
      stopCrons();
      await app.close();
      await closePool();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ host: '0.0.0.0', port: env.PORT });
    logger.info({ port: env.PORT }, `Server listening on http://localhost:${env.PORT}`);
    if (env.START_CRONS) {
      startCrons();
    } else {
      logger.info('START_CRONS=false — crons disabled');
    }
    // Базовый снимок состояния когорт при старте (Фаза B «недельного радара») — гарантирует,
    // что история начнёт копиться даже при выключенном планировщике. Гард внутри пишет не чаще
    // ~раза в неделю, поэтому частые деплои не плодят дубли. Fire-and-forget — старт не блокируем.
    void captureSnapshotIfDue(2)
      .then((r) => { if (r.captured) logger.info({ written: r.written }, 'startup: базовый federation snapshot записан'); })
      .catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'startup snapshot seed failed'));
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void start();
