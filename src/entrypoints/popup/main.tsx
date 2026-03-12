import React, { Component, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './style.css';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '16px',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            color: '#991b1b',
            backgroundColor: '#fef2f2',
            borderRadius: '6px',
            margin: '12px',
          }}
        >
          <strong>Something went wrong.</strong>
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#666', wordBreak: 'break-word' }}>
            {(this.state.error as Error).message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '10px',
              padding: '5px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              border: '1px solid #fca5a5',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#991b1b',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
