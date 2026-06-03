import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/middleware.js';
import { withTenant } from '../db/tenantContext.js';
import { UnauthorizedError, ForbiddenError } from '../shared/errors.js';

/**
 * Tenant-scoped API тренировок (Sprint 5.1). Раньше существовали только схема
 * (db/schema/trainings) и фронт (TrainingsPage) — бэкенда не было, поэтому
 * /api/v1/trainings/* отвечал 404 «Not Found» и расписание не грузилось.
 *
 * Паттерн как в data/routes: JWT + явная фильтрация по tenant_id + withTenant
 * (ставит app.tenant_id для RLS).
 */
type AnyBody = Record<string, unknown>;

const TRAINING_COLS =
  `id, team_id AS "teamId", starts_at AS "startsAt", duration_min AS "durationMin",
   venue_id AS "venueId", venue_text AS "venueText", type, notes,
   created_by AS "createdBy", created_at AS "createdAt"`;

export async function trainingsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  function tenantId(req: { user?: { tenantId: string | null } }): string {
    const id = req.user?.tenantId;
    if (!id) throw new UnauthorizedError('tenant context required');
    return id;
  }
  function assertCoach(req: { user?: { role?: string } }): void {
    const role = req.user?.role;
    if (role !== 'head_coach' && role !== 'team_coach') {
      throw new ForbiddenError('только тренер может управлять тренировками');
    }
  }

  // GET /trainings/team/:teamId?scope=upcoming|past|all
  app.get<{ Params: { teamId: string }; Querystring: { scope?: string } }>(
    '/trainings/team/:teamId',
    async (req) => {
      const slug = tenantId(req);
      const { teamId } = req.params;
      const scope = req.query.scope ?? 'upcoming';
      return withTenant(slug, async (_tx, conn) => {
        let where = 'tenant_id = $1 AND team_id = $2';
        if (scope === 'upcoming') where += ' AND starts_at >= now()';
        else if (scope === 'past') where += ' AND starts_at < now()';
        const order = scope === 'past' ? 'DESC' : 'ASC';
        const { rows } = await conn.query(
          `SELECT ${TRAINING_COLS} FROM trainings WHERE ${where} ORDER BY starts_at ${order}`,
          [slug, teamId],
        );
        return { trainings: rows };
      });
    },
  );

  // GET /trainings/:id
  app.get<{ Params: { id: string } }>('/trainings/:id', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT ${TRAINING_COLS} FROM trainings WHERE tenant_id = $1 AND id = $2`,
        [slug, req.params.id],
      );
      return { training: rows[0] ?? null };
    });
  });

  // POST /trainings — создать
  app.post<{ Body: AnyBody }>('/trainings', async (req) => {
    const slug = tenantId(req);
    assertCoach(req);
    const b = req.body ?? {};
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `INSERT INTO trainings
           (tenant_id, team_id, starts_at, duration_min, venue_id, venue_text, type, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING ${TRAINING_COLS}`,
        [
          slug, b.teamId, b.startsAt, Number(b.durationMin ?? 90),
          (b.venueId as string) ?? null, (b.venueText as string) ?? null,
          (b.type as string) ?? 'training', (b.notes as string) ?? null,
          req.user?.sub ?? null,
        ],
      );
      return { training: rows[0] };
    });
  });

  // PATCH /trainings/:id — изменить
  app.patch<{ Params: { id: string }; Body: AnyBody }>('/trainings/:id', async (req) => {
    const slug = tenantId(req);
    assertCoach(req);
    const b = req.body ?? {};
    const map: Record<string, string> = {
      startsAt: 'starts_at', durationMin: 'duration_min', venueId: 'venue_id',
      venueText: 'venue_text', type: 'type', notes: 'notes',
    };
    const sets: string[] = [];
    const vals: unknown[] = [slug, req.params.id];
    for (const [key, col] of Object.entries(map)) {
      if (b[key] !== undefined) { vals.push(b[key]); sets.push(`${col} = $${vals.length}`); }
    }
    if (sets.length === 0) return { ok: true };
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `UPDATE trainings SET ${sets.join(', ')}, updated_at = now()
           WHERE tenant_id = $1 AND id = $2 RETURNING ${TRAINING_COLS}`,
        vals,
      );
      return { training: rows[0] ?? null };
    });
  });

  // DELETE /trainings/:id
  app.delete<{ Params: { id: string } }>('/trainings/:id', async (req) => {
    const slug = tenantId(req);
    assertCoach(req);
    return withTenant(slug, async (_tx, conn) => {
      await conn.query('DELETE FROM trainings WHERE tenant_id = $1 AND id = $2', [slug, req.params.id]);
      return { ok: true };
    });
  });

  // GET /trainings/:id/attendance — отметки посещаемости
  app.get<{ Params: { id: string } }>('/trainings/:id/attendance', async (req) => {
    const slug = tenantId(req);
    return withTenant(slug, async (_tx, conn) => {
      const { rows } = await conn.query(
        `SELECT player_id AS "playerId", response_status AS "responseStatus",
                presence_status AS "presenceStatus", note
           FROM training_attendance WHERE tenant_id = $1 AND training_id = $2`,
        [slug, req.params.id],
      );
      return { attendance: rows };
    });
  });

  // POST /trainings/:id/attendance — сохранить отметки {marks:[{playerId,presenceStatus,note}]}
  app.post<{ Params: { id: string }; Body: { marks?: AnyBody[] } }>(
    '/trainings/:id/attendance',
    async (req) => {
      const slug = tenantId(req);
      assertCoach(req);
      const marks = req.body?.marks ?? [];
      return withTenant(slug, async (_tx, conn) => {
        for (const m of marks) {
          await conn.query(
            `INSERT INTO training_attendance
               (training_id, player_id, tenant_id, presence_status, presence_at, marked_by, note)
             VALUES ($1,$2,$3,$4, now(), $5,$6)
             ON CONFLICT (training_id, player_id) DO UPDATE
               SET presence_status = EXCLUDED.presence_status,
                   presence_at = now(), marked_by = EXCLUDED.marked_by, note = EXCLUDED.note`,
            [req.params.id, m.playerId, slug, (m.presenceStatus as string) ?? null, req.user?.sub ?? null, (m.note as string) ?? null],
          );
        }
        return { ok: true, saved: marks.length };
      });
    },
  );

  // POST /trainings/:id/respond — игрок отмечает приду/не приду {status}
  app.post<{ Params: { id: string }; Body: { status?: string } }>(
    '/trainings/:id/respond',
    async (req) => {
      const slug = tenantId(req);
      const playerId = req.user?.playerId;
      if (!playerId) throw new ForbiddenError('только игрок может ответить');
      const status = req.body?.status ?? null;
      return withTenant(slug, async (_tx, conn) => {
        await conn.query(
          `INSERT INTO training_attendance
             (training_id, player_id, tenant_id, response_status, response_at)
           VALUES ($1,$2,$3,$4, now())
           ON CONFLICT (training_id, player_id) DO UPDATE
             SET response_status = EXCLUDED.response_status, response_at = now()`,
          [req.params.id, playerId, slug, status],
        );
        return { ok: true };
      });
    },
  );

  // GET /trainings/team/:teamId/player/:playerId/stats — посещаемость игрока
  app.get<{ Params: { teamId: string; playerId: string } }>(
    '/trainings/team/:teamId/player/:playerId/stats',
    async (req) => {
      const slug = tenantId(req);
      const { teamId, playerId } = req.params;
      return withTenant(slug, async (_tx, conn) => {
        const { rows } = await conn.query(
          `SELECT
             COUNT(*) FILTER (WHERE t.starts_at < now()) AS "totalPast",
             COUNT(*) FILTER (WHERE a.presence_status = 'present') AS "present",
             COUNT(*) FILTER (WHERE a.presence_status = 'late') AS "late",
             COUNT(*) FILTER (WHERE a.presence_status = 'absent') AS "absent"
           FROM trainings t
           LEFT JOIN training_attendance a
             ON a.training_id = t.id AND a.player_id = $3 AND a.tenant_id = $1
           WHERE t.tenant_id = $1 AND t.team_id = $2`,
          [slug, teamId, playerId],
        );
        return { stats: rows[0] ?? null };
      });
    },
  );
}
