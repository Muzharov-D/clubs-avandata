// Универсальный skeleton-placeholder для async-загрузки.
//
// Использование:
//   <Skeleton h={48} />                  — одна полоса 48px
//   <Skeleton w="60%" h={14} />          — 60% ширины × 14px
//   <Skeleton.List count={5} h={64} />   — 5 полос подряд (для list-блоков)

import './Skeleton.css';

function Skeleton({ w = '100%', h = 16, br = 6, className = '', style = {} }) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{ width: w, height: h, borderRadius: br, ...style }}
    />
  );
}

Skeleton.List = function SkeletonList({ count = 3, h = 56, gap = 8, ...rest }) {
  return (
    <div className="skeleton-list" style={{ gap }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} h={h} {...rest} />
      ))}
    </div>
  );
};

export default Skeleton;
