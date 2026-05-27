export function ratingColor(value) {
  if (value === null || value === undefined || isNaN(value)) return '#888';
  if (value >= 9.0) return '#2e7d32';
  if (value >= 8.0) return '#7cb342';
  if (value >= 7.0) return '#fbc02d';
  if (value >= 6.0) return '#fb8c00';
  return '#d32f2f';
}

export function ratingTextColor(value) {
  if (value >= 7.0 && value < 8.0) return '#222';
  return '#fff';
}
