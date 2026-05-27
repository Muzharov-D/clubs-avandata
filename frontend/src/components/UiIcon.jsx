// Универсальная UI-иконка из /public/icons/ui/{name}.svg
// Заменяет эмодзи (📍🏃⚽📅 etc) — выглядят профессиональнее.

import './UiIcon.css';

// Имя файла для исключений (с заглавной буквы и т.п.)
const OVERRIDE = {
  'phone-share': 'Phone.svg',
};

export default function UiIcon({ name, size = 16, alt = '', className = '' }) {
  if (!name) return null;
  const file = OVERRIDE[name] || `${name}.svg`;
  return (
    <img
      src={`/icons/ui/${file}`}
      alt={alt}
      className={`ui-icon ${className}`.trim()}
      width={size}
      height={size}
      aria-hidden={alt ? undefined : 'true'}
    />
  );
}
