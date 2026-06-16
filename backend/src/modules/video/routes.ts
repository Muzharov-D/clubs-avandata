import type { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../../auth/middleware.js';
import { BadRequestError } from '../../shared/errors.js';
import { isBigbroConfigured, listCameras, createOrder, getOrderVideo } from '../../services/bigbroApi.js';

/**
 * Роуты интеграции bigbro.ai — заказ обработки видео матчей.
 * Чтение (камеры, видео заказа) — любой залогиненный клубный пользователь.
 * Создание заказа (исходящее действие на инфраструктуру коллег) — только
 * head_coach и только по явному запросу.
 */
export async function videoRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  /** GET /api/v1/video/cameras — список камер (площадок) bigbro. */
  app.get('/video/cameras', async () => {
    if (!isBigbroConfigured()) {
      throw new BadRequestError('bigbro не настроен (BIGBRO_USERNAME/PASSWORD в env)', 'BIGBRO_NOT_CONFIGURED');
    }
    return { cameras: await listCameras() };
  });

  /** POST /api/v1/video/orders — создать заказ на обработку видео (head_coach). */
  app.post('/video/orders', { onRequest: authorize('head_coach') }, async (req) => {
    if (!isBigbroConfigured()) {
      throw new BadRequestError('bigbro не настроен (BIGBRO_USERNAME/PASSWORD в env)', 'BIGBRO_NOT_CONFIGURED');
    }
    const b = req.body as { playground?: number; videoStart?: string; videoEnd?: string; activityDate?: string };
    if (!b?.playground || !b.videoStart || !b.videoEnd) {
      throw new BadRequestError('playground, videoStart, videoEnd обязательны', 'BAD_ORDER');
    }
    return await createOrder({
      playground: b.playground,
      videoStart: b.videoStart,
      videoEnd: b.videoEnd,
      activityDate: b.activityDate,
    });
  });

  /** GET /api/v1/video/orders/:id/video — URL видеоплеера заказа (для iframe). */
  app.get('/video/orders/:id/video', async (req) => {
    const { id } = req.params as { id: string };
    return await getOrderVideo(id);
  });
}
