import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('24h'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),

  // Cron + external providers
  START_CRONS: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),
  FFSPB_API_KEY: z.string().optional(),
  FFSPB_ENDPOINT: z.string().url().default('https://stat.ffspb.org/api'),
  // Протокол матча (голы/судьи/тренеры) из FFSPB в карточке матча федерации.
  // По умолчанию OFF: stat.ffspb.org НЕДОСТУПЕН с Render (блок IP ДЦ). Включить,
  // когда FFSPB_ENDPOINT указывает на достижимый прокси (РФ-регион) — тогда
  // фоновый пред-синк протоколов оживёт без правок кода.
  FFSPB_MATCH_PROTOCOL: z
    .string()
    .transform((v) => v === 'true' || v === '1' || v === 'on')
    .default('false'),

  // bigbro.ai — заказ обработки видео матчей (коллеги, разбирающие записи).
  BIGBRO_ENDPOINT: z.string().url().default('https://api.bigbro.ai/backend'),
  BIGBRO_USERNAME: z.string().optional(),
  BIGBRO_PASSWORD: z.string().optional(),

  // АванДата-портал — «моя база» разобранных матчей и игроков (только чтение).
  // Авторизация: предпочтительно AVANDATA_API_KEY (заголовок X-API-Key), иначе
  // email/password (JWT). База API — back.avandata.ru (app.avandata.ru — это SPA).
  AVANDATA_ENDPOINT: z.string().url().default('https://back.avandata.ru'),
  AVANDATA_API_KEY: z.string().optional(),
  AVANDATA_EMAIL: z.string().optional(),
  AVANDATA_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
