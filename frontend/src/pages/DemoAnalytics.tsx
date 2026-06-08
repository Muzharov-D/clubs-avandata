/**
 * DemoAnalytics — кино-демо расширенной аналитики (апселл free → paid).
 *
 * ВАЖНО (безопасность тарифа): страница НЕ монтирует реальные платные блоки и
 * НЕ читает платные поля из API. Все цифры/графики ниже — синтетические,
 * захардкоженные образцы вымышленного клуба. На free-клиенте реальных платных
 * данных нет вообще → «искать дыры» не в чем.
 *
 * Задача — вау-эффект: при заходе аналитика красиво «оживает» (count-up, прорисовка
 * баров, каскад появления карточек). Русский UI; xG/xT — общепринятые обозначения.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { AnimatedNumber } from '../components/motion/AnimatedNumber';
import './DemoAnalytics.css';

const one = (v: number): string => v.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ── Синтетические образцы (вымышленный клуб) ─────────────────────────────────
const XG_FOR = 31.4;
const XG_AGAINST = 18.7;
const XG_PER_MATCH = [1.8, 2.4, 1.1, 3.2, 0.9, 2.7, 1.5, 2.2, 1.9, 2.6, 1.3, 2.9];

const STYLE_GAUGES = [
  { label: 'Прессинг', value: 78 },
  { label: 'Вертикальность', value: 64 },
  { label: 'Контроль мяча', value: 57 },
  { label: 'Темп', value: 71 },
];

const PASS_PROFILE = [
  { label: 'Точность передач', value: 84, unit: '%' },
  { label: 'Длинные передачи', value: 22, unit: '%' },
  { label: 'Ключевые / матч', value: 9, unit: '' },
  { label: 'Навесы / матч', value: 14, unit: '' },
];

const RUNNERS = [
  { name: 'А. Соколов', km: 11.4, sprints: 38 },
  { name: 'М. Орлов', km: 10.9, sprints: 41 },
  { name: 'Д. Лебедев', km: 10.6, sprints: 29 },
  { name: 'К. Зайцев', km: 10.1, sprints: 34 },
];

const THREAT = [
  { name: 'М. Орлов', xt: 4.8 },
  { name: 'А. Соколов', xt: 4.1 },
  { name: 'Р. Громов', xt: 3.3 },
  { name: 'Д. Лебедев', xt: 2.7 },
  { name: 'К. Зайцев', xt: 2.0 },
];

// Карта зон активности 6×4 (доля интенсивности 0..1) — слева направо = от своих ворот к чужим.
const HEAT_COLS = 6;
const HEAT = [
  0.1, 0.2, 0.35, 0.5, 0.62, 0.45,
  0.18, 0.3, 0.55, 0.78, 0.9, 0.6,
  0.16, 0.28, 0.52, 0.74, 0.88, 0.58,
  0.08, 0.18, 0.32, 0.48, 0.6, 0.42,
];

const maxXgBar = Math.max(...XG_PER_MATCH);
const maxKm = Math.max(...RUNNERS.map((r) => r.km));
const maxXt = Math.max(...THREAT.map((t) => t.xt));

const card: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0, 0.38, 0.9] } },
};

export default function DemoAnalytics() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [contacted, setContacted] = useState(false);

  const viewport = { once: true, amount: 0.3 } as const;

  return (
    <div className="demo">
      <button className="demo__back" onClick={() => navigate(-1)} aria-label="Назад">
        ← Назад
      </button>

      {/* Hero */}
      <motion.header
        className="demo__hero"
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0, 0, 0.38, 0.9] }}
      >
        <span className="demo__chip">Демо · образец клуба</span>
        <h1 className="demo__title">Расширенная аналитика</h1>
        <p className="demo__sub">
          Полная картина сезона: ожидаемые голы, стиль игры, физика и карты активности.
          Вот что открывает платный тариф.
        </p>
      </motion.header>

      <div className="demo__grid">
        {/* xG-аналитика */}
        <motion.section
          className="demo__card demo__card--wide"
          variants={card}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
        >
          <div className="demo__card-head">
            <h2>xG-аналитика сезона</h2>
            <span className="demo__hint">Ожидаемые голы за и против</span>
          </div>
          <div className="demo__xg-nums">
            <div className="demo__xg">
              <AnimatedNumber className="demo__xg-val demo__xg-val--for" value={XG_FOR} format={one} />
              <span className="demo__xg-cap">xG за сезон</span>
            </div>
            <div className="demo__xg-div">—</div>
            <div className="demo__xg">
              <AnimatedNumber className="demo__xg-val demo__xg-val--ag" value={XG_AGAINST} format={one} />
              <span className="demo__xg-cap">xG соперников</span>
            </div>
          </div>
          <div className="demo__xg-bars" aria-hidden>
            {XG_PER_MATCH.map((v, i) => (
              <motion.span
                key={i}
                className="demo__xg-bar"
                initial={reduce ? false : { scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={viewport}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.05, ease: [0.2, 0, 0.38, 0.9] }}
                style={{ height: `${(v / maxXgBar) * 100}%` }}
              />
            ))}
          </div>
          <p className="demo__verdict">Заслуженный счёт сезона — в среднем <b>+1.1</b> к фактическому. Команда забивает меньше, чем создаёт.</p>
        </motion.section>

        {/* Стиль игры */}
        <motion.section className="demo__card" variants={card} initial="hidden" whileInView="show" viewport={viewport}>
          <div className="demo__card-head">
            <h2>Стиль игры</h2>
          </div>
          <p className="demo__style-verdict">Высокий прессинг · вертикальный розыгрыш</p>
          <div className="demo__gauges">
            {STYLE_GAUGES.map((g, i) => (
              <div className="demo__gauge" key={g.label}>
                <div className="demo__gauge-top">
                  <span>{g.label}</span>
                  <AnimatedNumber className="demo__gauge-num" value={g.value} />
                </div>
                <div className="demo__track">
                  <motion.span
                    className="demo__fill"
                    initial={reduce ? false : { width: 0 }}
                    whileInView={{ width: `${g.value}%` }}
                    viewport={viewport}
                    transition={{ duration: 0.7, delay: 0.15 + i * 0.08, ease: [0.32, 0.72, 0, 1] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Карта зон активности */}
        <motion.section className="demo__card" variants={card} initial="hidden" whileInView="show" viewport={viewport}>
          <div className="demo__card-head">
            <h2>Карта зон активности</h2>
            <span className="demo__hint">Атака — направо</span>
          </div>
          <div className="demo__pitch" style={{ gridTemplateColumns: `repeat(${HEAT_COLS}, 1fr)` }}>
            {HEAT.map((v, i) => (
              <motion.span
                key={i}
                className="demo__cell"
                initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={viewport}
                transition={{ duration: 0.4, delay: i * 0.02, ease: [0.34, 1.56, 0.64, 1] }}
                style={{ background: `color-mix(in srgb, var(--accent-cyan) ${Math.round(v * 80)}%, transparent)` }}
              />
            ))}
          </div>
        </motion.section>

        {/* Физическая нагрузка */}
        <motion.section className="demo__card" variants={card} initial="hidden" whileInView="show" viewport={viewport}>
          <div className="demo__card-head">
            <h2>Физическая нагрузка</h2>
            <span className="demo__hint">Дистанция за матч</span>
          </div>
          <ul className="demo__list">
            {RUNNERS.map((r, i) => (
              <li key={r.name} className="demo__row">
                <span className="demo__row-name">{r.name}</span>
                <div className="demo__row-track">
                  <motion.span
                    className="demo__row-fill"
                    initial={reduce ? false : { width: 0 }}
                    whileInView={{ width: `${(r.km / maxKm) * 100}%` }}
                    viewport={viewport}
                    transition={{ duration: 0.7, delay: i * 0.08, ease: [0.32, 0.72, 0, 1] }}
                  />
                </div>
                <span className="demo__row-val">
                  <AnimatedNumber value={r.km} format={one} /> км · {r.sprints} рывков
                </span>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* Профиль передач */}
        <motion.section className="demo__card" variants={card} initial="hidden" whileInView="show" viewport={viewport}>
          <div className="demo__card-head">
            <h2>Профиль передач</h2>
          </div>
          <div className="demo__stats">
            {PASS_PROFILE.map((s) => (
              <div className="demo__stat" key={s.label}>
                <AnimatedNumber className="demo__stat-num" value={s.value} />
                <span className="demo__stat-unit">{s.unit}</span>
                <span className="demo__stat-cap">{s.label}</span>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Угроза (xT) */}
        <motion.section className="demo__card" variants={card} initial="hidden" whileInView="show" viewport={viewport}>
          <div className="demo__card-head">
            <h2>Лидеры по угрозе</h2>
            <span className="demo__hint">xT — вклад в продвижение к воротам</span>
          </div>
          <ul className="demo__list">
            {THREAT.map((t, i) => (
              <li key={t.name} className="demo__row">
                <span className="demo__row-name">{t.name}</span>
                <div className="demo__row-track">
                  <motion.span
                    className="demo__row-fill demo__row-fill--alt"
                    initial={reduce ? false : { width: 0 }}
                    whileInView={{ width: `${(t.xt / maxXt) * 100}%` }}
                    viewport={viewport}
                    transition={{ duration: 0.7, delay: i * 0.08, ease: [0.32, 0.72, 0, 1] }}
                  />
                </div>
                <span className="demo__row-val">
                  <AnimatedNumber value={t.xt} format={one} /> xT
                </span>
              </li>
            ))}
          </ul>
        </motion.section>
      </div>

      {/* CTA */}
      <motion.footer
        className="demo__cta"
        initial={reduce ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={{ duration: 0.5, ease: [0.2, 0, 0.38, 0.9] }}
      >
        <h2 className="demo__cta-title">Подключить расширенную аналитику</h2>
        <p className="demo__cta-sub">
          Все метрики выше — на каждом вашем матче и игроке. Тариф подключает администратор платформы.
        </p>
        {contacted ? (
          <p className="demo__cta-done">Спасибо! Передадим запрос администратору платформы.</p>
        ) : (
          <button className="demo__cta-btn" onClick={() => setContacted(true)}>
            Хочу расширенную аналитику
          </button>
        )}
        <p className="demo__disclaimer">Данные на этой странице — демонстрационные, для примера.</p>
      </motion.footer>
    </div>
  );
}
