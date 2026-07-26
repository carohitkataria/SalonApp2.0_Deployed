import React from 'react';

/**
 * Top-level ErrorBoundary — prevents a blank white screen if any child
 * component throws during render. Shows a friendly fallback with a
 * "Reload" action. Errors are also logged to the browser console so
 * the developer console still captures them for debugging.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleReload = () => {
    try { window.location.assign('/'); } catch (_) { window.location.reload(); }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: '#F4F7FC', fontFamily: 'Inter, system-ui, sans-serif', padding: 24,
      }} data-testid="app-error-boundary">
        <div style={{
          maxWidth: 460, background: '#fff', border: '1px solid #E6EBF4',
          borderRadius: 16, padding: 28, textAlign: 'center',
          boxShadow: '0 10px 40px rgba(20,28,46,.12)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: '#FDECEC',
            color: '#E5484D', display: 'grid', placeItems: 'center', margin: '0 auto 14px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: '#141C2E' }}>Something went wrong.</h2>
          <p style={{ fontSize: 13.5, color: '#6B7793', marginBottom: 18, lineHeight: 1.5 }}>
            Sorry about that — reload the app to try again. If the issue persists, please share the screen with our team.
          </p>
          <button onClick={this.handleReload} data-testid="app-error-reload-btn"
                  style={{
                    background: '#1B54C7', color: '#fff', fontWeight: 700, fontSize: 13.5,
                    padding: '10px 18px', border: 'none', borderRadius: 10, cursor: 'pointer',
                  }}>
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
