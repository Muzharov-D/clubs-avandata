/**
 * Валидация вывода парсера ПЕРЕД записью в БД (Phase 1 — доверие к данным).
 *
 * Два уровня:
 *  1. validateRich() — zod-схема: парсер вернул структурно корректный JSON.
 *     Ловит регрессии парсера (например, отдал список вместо словаря).
 *  2. assertSportVisor() — семантика: это действительно отчёт SportVisor, а не
 *     произвольный PDF. Если ни rich, ни legacy не нашли игроков — отклоняем
 *     загрузку с человекочитаемым 400, а не пишем пустой матч.
 */
import { z } from 'zod';
import { BadRequestError } from '../shared/errors.js';

const numRecord = z.record(z.unknown());

export const richSchema = z
  .object({
    overall_meta: z.record(
      z
        .object({
          name: z.string().optional(),
          position: z.string().nullable().optional(),
          minutes: z.number().nullable().optional(),
        })
        .passthrough(),
    ),
    radar: z.record(numRecord),
    fitness: z.record(numRecord),
    attack: z.record(numRecord),
    defence: z.record(numRecord),
  })
  .passthrough();

export type RichParsed = z.infer<typeof richSchema>;

export function validateRich(raw: unknown): RichParsed {
  const parsed = richSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => i.path.join('.') || '<root>').join(', ');
    throw new BadRequestError(
      `Парсер вернул некорректную структуру (${where}). Возможно, формат отчёта изменился.`,
      'PARSER_OUTPUT_INVALID',
    );
  }
  return parsed.data;
}

/**
 * Семантическая проверка: распознан ли это вообще отчёт SportVisor.
 * @param richPlayers  кол-во игроков в rich.radar
 * @param legacyPlayers кол-во игроков в build_match.players
 */
export function assertSportVisor(richPlayers: number, legacyPlayers: number): void {
  if (richPlayers === 0 && legacyPlayers === 0) {
    throw new BadRequestError(
      'Не удалось распознать игроков в файле. Убедитесь, что загружаете PDF-отчёт SportVisor по матчу.',
      'NOT_SPORTVISOR',
    );
  }
}
