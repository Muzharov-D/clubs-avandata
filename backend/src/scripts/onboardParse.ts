/**
 * Парсер маппинга команд для onboardClub — вынесен для юнит-тестов
 * (onboardClub.ts запускает main() на импорте, поэтому тестировать его напрямую нельзя).
 */
export interface TeamSpec {
  ageGroup: string;       // '2010'
  tournamentId: string;   // FFSPB турнир лиги (матчи + таблица)
  ffspbTeamId: string;    // FFSPB id команды (ростер игроков)
  cupId: string | null;   // опц. FFSPB турнир кубка (матчи)
}

/** `--teams="age:tournamentId:ffspbTeamId[:cupId], ..."` → список команд. Бросает на битом/пустом. */
export function parseTeams(raw: string): TeamSpec[] {
  const specs: TeamSpec[] = [];
  for (const chunk of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [age, tid, team, cup] = chunk.split(':').map((s) => s.trim());
    if (!age || !tid || !team) {
      throw new Error(`плохой формат команды "${chunk}" — нужно age:tournamentId:ffspbTeamId[:cupId]`);
    }
    specs.push({ ageGroup: age, tournamentId: tid, ffspbTeamId: team, cupId: cup || null });
  }
  if (!specs.length) throw new Error('--teams пуст');
  return specs;
}
