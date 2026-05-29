/**
 * CSV-экспорт без зависимостей (Phase 3).
 * Разделитель «;» + BOM — чтобы кириллица корректно открывалась в Excel.
 */
function esc(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  if (!rows?.length) return '';
  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => esc(c.label)).join(';');
  const body = rows
    .map((r) => cols.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'))
    .join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(filename, rows, columns) {
  const csv = '﻿' + toCsv(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
