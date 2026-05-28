import { useState } from 'react';
import { getInitials } from '../utils/players';
import './PlayerPhoto.css';

// Placeholder-id'шки от автогенерации в upload pipeline — никогда не имеют файлов
// в /assets/players. Чтобы не было шума 404 в network tab и микро-флика битой
// картинки, сразу рендерим инициалы для таких id.
const PLACEHOLDER_ID_RE = /^(sv|pdf|tmp|manual)-/i;

export default function PlayerPhoto({ player, size = 64, className = '' }) {
  const [errored, setErrored] = useState(false);

  // Источник фото:
  //  1) player.photo / photoUrl = абсолютный URL (https://...) → берём как есть
  //  2) player.photo / photoUrl = имя файла → префиксим /assets/players/
  //  3) ничего нет, есть id и id НЕ placeholder → пробуем /assets/players/{id}.png
  //  4) placeholder id или ничего нет → сразу инициалы
  const explicitPhoto = (typeof player?.photo === 'string' && player.photo) ||
                        (typeof player?.photoUrl === 'string' && player.photoUrl) ||
                        null;
  const idGuess = (!explicitPhoto && player?.id && !PLACEHOLDER_ID_RE.test(String(player.id)))
    ? `${player.id}.png`
    : null;
  const rawPhoto = explicitPhoto || idGuess;

  let src = null;
  if (typeof rawPhoto === 'string' && rawPhoto.length > 0) {
    src = /^https?:\/\//i.test(rawPhoto) ? rawPhoto : `/assets/players/${rawPhoto}`;
  }

  const initials = getInitials(player?.firstName, player?.lastName);
  const style = { width: size, height: size };

  if (!src || errored) {
    return (
      <div className={`player-photo player-photo--fallback ${className}`} style={style}
           role="img" aria-label={player?.fullName || 'Без фото'}>
        <span style={{ fontSize: size * 0.36 }}>{initials || '?'}</span>
      </div>
    );
  }
  return (
    <div className={`player-photo ${className}`} style={style}>
      <img
        src={src}
        alt={player?.fullName || ''}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setErrored(true)}
      />
    </div>
  );
}
