import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../api/client';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login({
        email,
        password,
        tenantSlug: isAdmin ? undefined : tenantSlug,
      });
      const target =
        user.role === 'platform_admin'
          ? '/admin'
          : ((loc.state as { from?: string } | null)?.from ?? '/');
      nav(target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка входа');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: '60px auto', padding: '0 20px' }}>
      <h1 style={{ marginBottom: 24, fontSize: 26 }}>Вход в кабинет клуба</h1>
      <form onSubmit={onSubmit} className="surface" style={{ display: 'grid', gap: 16 }}>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label>Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            cursor: 'pointer',
            marginBottom: 0,
          }}
        >
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span style={{ color: 'var(--text-muted)' }}>Вход для администратора платформы</span>
        </label>

        {!isAdmin && (
          <div>
            <label>Клуб (slug)</label>
            <input
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="legirus"
              required
            />
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
