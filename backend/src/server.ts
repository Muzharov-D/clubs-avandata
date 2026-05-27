import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { env } from './env.js';
import { logger } from './shared/logger.js';
import { AppError } from './shared/errors.js';
import { authRoutes } from './auth/routes.js';
import { tenantRoutes } from './tenants/routes.js';
import { adminRoutes } from './admin/routes.js';
import { closePool } from './db/client.js';
import { startCrons, stopCrons } from './cron/runner.js';

async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: false,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
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

  return app;
}

async function start() {
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
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void start();
