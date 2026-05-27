// Маппинг год-рождения → турнирная категория U-XX и UI-метаданные.
// Возрастные группы Легируса по сезону 2025-26 (Вторая лига СПб).

// Младшие — отдельная группа для UX (свайп 1 в AddTeamSheet, верхняя секция лендинга).
export const AGE_GROUPS_YOUNGER = ['2016', '2015', '2014'];

// Старшие — основная группа (включает 4 возраста, идущих в клубный зачёт).
// '2008-09' — единый турнир U19 в FFSPB, отображается как «2008/09».
export const AGE_GROUPS_OLDER = ['2013', '2012', '2011', '2010', '2008-09'];

// Полный список (порядок: младший→старший, от 2016 к 2008/09).
export const AGE_GROUPS = [...AGE_GROUPS_YOUNGER, ...AGE_GROUPS_OLDER];

// Какие возрасты идут в клубный зачёт (на /club). Должно совпадать с
// backend/data/standings/_config.json → clubRankCounted. По требованию заказчика —
// только эти 4 группы (новые младшие/старшие — НЕ суммируются, строго).
export const AGE_GROUPS_CLUB_RANK = ['2010', '2011', '2012', '2013'];

export const AGE_TO_TIER = {
  '2008-09': 'U19',
  '2010':    'U17',
  '2011':    'U16',
  '2012':    'U15',
  '2013':    'U14',
  '2014':    'U13',
  '2015':    'U12',
  '2016':    'U11',
};

export function tierForAge(age) {
  const key = String(age);
  return AGE_TO_TIER[key] || key;
}

// «2008-09» → «2008/09» (для отображения). Прочие — без изменений.
export function displayAge(age) {
  if (age === '2008-09') return '2008/09';
  return String(age);
}

export function leaguePosClass(pos) {
  if (pos === 1) return 'rank-medal--gold';
  if (pos === 2) return 'rank-medal--silver';
  if (pos === 3) return 'rank-medal--bronze';
  return 'rank-medal--base';
}

export function clubPosClass(pos) {
  if (pos === 1) return 'rank-medal--gold';
  if (pos === 2) return 'rank-medal--silver';
  return 'rank-medal--base';
}
