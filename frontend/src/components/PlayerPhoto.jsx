import { useState } from 'react';
import { getInitials } from '../utils/players';
import './PlayerPhoto.css';

export default function PlayerPhoto({ player, size = 64, className = '' }) {
  const [errored, setErrored] = useState(false);
  // Поддерживаем три варианта источника фото:
  //  1) player.photo / photoUrl = абсолютный URL (https://img.nagradion.ru/...) → берём как есть
  //  2) player.photo / photoUrl = имя файла (p17-turapin.png) → префиксим /assets/players/
  //  3) ничего нет, но есть id → пробуем /assets/players/{id}.png
  const rawPhoto = (typeof player?.photo === 'string' && player.photo) ||
                   (typeof player?.photoUrl === 'string' && player.photoUrl) ||
                   (player?.id ? `${player.id}.png` : null);
  let src = null;
  if (typeof rawPhoto === 'string' && rawPhoto.length > 0) {
    src = /^https?:\/\//i.test(rawPhoto) ? rawPhoto : `/assets/players/${rawPhoto}`;
  }
  const initials = getInitials(player?.firstName, player?.lastName);
  const style = { width: size, height: size };

  if (!src || errored) {
    return (
      <div className={`player-photo player-photo--fallback ${className}`} style={style}>
        <span style={{ fontSize: size * 0.36 }}>{initials || '?'}</span>
      </div>
    );
  }
  return (
    <div className={`player-photo ${className}`} style={style}>
      <img src={src} alt={player?.fullName || ''} onError={() => setErrored(true)} />
    </div>
  );
}
