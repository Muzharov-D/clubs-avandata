-- Слияние дублей игроков, заведённых ПОД РАЗНЫМИ НОМЕРАМИ как разные люди.
-- Раньше id игрока = sv-{team}-n{NN} (по номеру), поэтому один человек, игравший
-- под 14 и 23 (напр. Ахмадов), превращался в 2 записи. Теперь объединение
-- идёт по имени (см. upload/routes.ts), а эта миграция чистит уже накопленные
-- дубли: схлопывает игроков с одинаковым нормализованным именем (в рамках
-- tenant+team) в одну запись и переносит на неё match_players.
--
-- Нормализация имени = lower(translate(ё→е)) без точек/запятых — совпадает с
-- playerNameKey в коде. Канонической оставляем запись с минимальным id.
-- Идемпотентно: после слияния групп с >1 не остаётся, повтор — no-op.

DO $$
DECLARE
  grp RECORD;
  keep_id text;
BEGIN
  FOR grp IN
    SELECT tenant_id, team_id,
           regexp_replace(lower(translate(full_name, 'ё', 'е')), '[.,]', '', 'g') AS nkey
      FROM players
     GROUP BY tenant_id, team_id,
              regexp_replace(lower(translate(full_name, 'ё', 'е')), '[.,]', '', 'g')
    HAVING count(*) > 1
  LOOP
    SELECT id INTO keep_id
      FROM players
     WHERE tenant_id = grp.tenant_id AND team_id = grp.team_id
       AND regexp_replace(lower(translate(full_name, 'ё', 'е')), '[.,]', '', 'g') = grp.nkey
     ORDER BY id
     LIMIT 1;

    -- 1) Переносим match_players на каноническую запись там, где у неё ещё нет
    --    строки на этот матч (иначе конфликт PK (match_id, player_id)).
    UPDATE match_players mp
       SET player_id = keep_id
     WHERE mp.player_id IN (
             SELECT id FROM players
              WHERE tenant_id = grp.tenant_id AND team_id = grp.team_id
                AND regexp_replace(lower(translate(full_name, 'ё', 'е')), '[.,]', '', 'g') = grp.nkey
                AND id <> keep_id)
       AND NOT EXISTS (
             SELECT 1 FROM match_players c
              WHERE c.match_id = mp.match_id AND c.player_id = keep_id);

    -- 2) Оставшиеся (коллизия: у канона уже есть строка на тот матч) — удаляем.
    DELETE FROM match_players mp
     WHERE mp.player_id IN (
             SELECT id FROM players
              WHERE tenant_id = grp.tenant_id AND team_id = grp.team_id
                AND regexp_replace(lower(translate(full_name, 'ё', 'е')), '[.,]', '', 'g') = grp.nkey
                AND id <> keep_id);

    -- 3) Удаляем дубли-записи игроков.
    DELETE FROM players
     WHERE tenant_id = grp.tenant_id AND team_id = grp.team_id
       AND regexp_replace(lower(translate(full_name, 'ё', 'е')), '[.,]', '', 'g') = grp.nkey
       AND id <> keep_id;
  END LOOP;
END $$;
