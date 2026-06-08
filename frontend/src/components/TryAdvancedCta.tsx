/**
 * TryAdvancedCta — плавающая кнопка-апселл «Попробовать расширенную аналитику».
 * Видна только клубам на free-тарифе (на paid скрыта — нечего предлагать).
 * Ведёт на кино-демо /demo-analytics (синтетические данные, без реальных платных).
 */
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantProvider';
import './TryAdvancedCta.css';

export default function TryAdvancedCta() {
  const navigate = useNavigate();
  const { tenant } = useTenant();

  // Показываем только когда клуб известен и тариф не платный.
  if (!tenant || tenant.plan === 'paid') return null;

  return (
    <button
      className="try-adv"
      onClick={() => navigate('/demo-analytics')}
      aria-label="Попробовать расширенную аналитику"
    >
      <span className="try-adv__spark" aria-hidden>✦</span>
      Попробовать расширенную аналитику
    </button>
  );
}
