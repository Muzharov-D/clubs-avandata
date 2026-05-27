import { Component } from 'react';
import * as Sentry from '@sentry/react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('App error:', error, info);
    // Отправляем в Sentry с дополнительным контекстом про React-стек.
    Sentry.withScope((scope) => {
      scope.setTag('source', 'react-error-boundary');
      scope.setExtras({ componentStack: info?.componentStack });
      Sentry.captureException(error);
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24, color: '#ef9a9a', fontFamily: 'monospace',
          background: '#1a0a0a', minHeight: '100vh',
        }}>
          <h2 style={{ color: '#ff5252', marginBottom: 12 }}>UI ошибка</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <button
            style={{ marginTop: 16, padding: '8px 14px', background: '#22d3ee', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
