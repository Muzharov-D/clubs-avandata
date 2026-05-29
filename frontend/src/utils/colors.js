export function ratingColor(value) {
  if (value === null || value === undefined || isNaN(value)) return '#888';
  const n = Number(value);
  if (n <= 0) return '#888';  // не оценён → серый, не красный
  if (n >= 9.0) return '#2e7d32';
  if (n >= 8.0) return '#7cb342';
  if (n >= 7.0) return '#fbc02d';
  if (n >= 6.0) return '#fb8c00';
  return '#d32f2f';
}

export function ratingTextColor(value) {
  if (value >= 7.0 && value < 8.0) return '#222';
  return '#fff';
}
