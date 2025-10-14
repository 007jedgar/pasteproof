import { useState, useEffect } from 'react';
import { getApiClient, initializeApiClient } from '@/shared/api-client';

type PopupState = {
  enabled: boolean;
  currentDomain: string;
  isWhitelisted: boolean;
  hasApiKey: boolean;
};

export default function PopupApp() {
  const [state, setState] = useState<PopupState>({
    enabled: true,
    currentDomain: '',
    isWhitelisted: false,
    hasApiKey: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      // Get current tab domain
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url || '');
      const domain = url.hostname;

      // Check if extension is enabled
      const { enabled = true } = await browser.storage.local.get('enabled');

      // Check if user has API key
      const { apiKey } = await browser.storage.local.get('apiKey');
      const hasApiKey = !!apiKey;

      // Check if current site is whitelisted
      let isWhitelisted = false;
      if (hasApiKey && apiKey) {
        try {
          const client = initializeApiClient(apiKey);
          isWhitelisted = await client.isWhitelisted(domain);
        } catch (error) {
          console.error('Failed to check whitelist:', error);
        }
      }

      setState({
        enabled,
        currentDomain: domain,
        isWhitelisted,
        hasApiKey,
      });
    } catch (error) {
      console.error('Failed to load popup state:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnabled = async () => {
    const newEnabled = !state.enabled;
    await browser.storage.local.set({ enabled: newEnabled });
    setState({ ...state, enabled: newEnabled });
  };

  const toggleWhitelist = async () => {
    if (!state.hasApiKey) {
      alert('Please configure your API key in Settings first');
      return;
    }

    try {
      const client = getApiClient();
      if (!client) return;

      if (state.isWhitelisted) {
        // Remove from whitelist (we need to get the whitelist ID first)
        const whitelist = await client.getWhitelist();
        const entry = whitelist.find(w => w.domain === state.currentDomain);
        if (entry) {
          await client.removeFromWhitelist(entry.id);
        }
      } else {
        // Add to whitelist
        await client.addToWhitelist(state.currentDomain);
      }

      setState({ ...state, isWhitelisted: !state.isWhitelisted });
    } catch (error) {
      console.error('Failed to toggle whitelist:', error);
      alert('Failed to update whitelist. Please try again.');
    }
  };

  const openOptions = (tab?: string) => {
    const url = tab ? `options.html#${tab}` : 'options.html';
    browser.runtime.openOptionsPage();
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>🛡️</div>
        <div>
          <div style={styles.title}>Paste Proof</div>
          <div style={styles.subtitle}>Your pasteboard bodyguard</div>
        </div>
      </div>

      {/* Status Badge */}
      <div style={{
        ...styles.statusBadge,
        backgroundColor: state.enabled ? '#e8f5e9' : '#ffebee',
      }}>
        <div style={{
          ...styles.statusDot,
          backgroundColor: state.enabled ? '#4caf50' : '#f44336',
        }} />
        <span style={{
          color: state.enabled ? '#2e7d32' : '#c62828',
          fontWeight: '600',
        }}>
          {state.enabled ? 'Protection Active' : 'Protection Disabled'}
        </span>
      </div>

      {/* Current Site */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Current Site</div>
        <div style={styles.domain}>{state.currentDomain}</div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <button
          onClick={toggleEnabled}
          style={{
            ...styles.button,
            ...styles.buttonPrimary,
          }}
        >
          {state.enabled ? '⏸️ Disable' : '▶️ Enable'} Protection
        </button>

        <button
          onClick={toggleWhitelist}
          disabled={!state.hasApiKey}
          style={{
            ...styles.button,
            ...styles.buttonSecondary,
            ...(state.isWhitelisted ? styles.buttonDanger : {}),
            ...(!state.hasApiKey ? styles.buttonDisabled : {}),
          }}
        >
          {state.isWhitelisted ? '✗ Remove from' : '✓ Add to'} Whitelist
        </button>
      </div>

      {!state.hasApiKey && (
        <div style={styles.warning}>
          ⚠️ Configure API key for Premium features
        </div>
      )}

      {/* Quick Links */}
      <div style={styles.divider} />

      <div style={styles.links}>
        <button onClick={() => openOptions('settings')} style={styles.link}>
          ⚙️ Settings
        </button>
        <button onClick={() => openOptions('patterns')} style={styles.link}>
          🔍 Patterns
        </button>
        <button onClick={() => openOptions('whitelist')} style={styles.link}>
          ✓ Whitelist
        </button>
        <button onClick={() => openOptions('dashboard')} style={styles.link}>
          📊 Dashboard
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '320px',
    padding: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#fafafa',
  },
  loading: {
    textAlign: 'center',
    padding: '20px',
    color: '#666',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  headerIcon: {
    fontSize: '36px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: '12px',
    color: '#666',
  },
  statusBadge: {
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  section: {
    marginBottom: '16px',
  },
  sectionLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#666',
    marginBottom: '4px',
    fontWeight: '600',
  },
  domain: {
    fontSize: '14px',
    color: '#333',
    fontWeight: '500',
    backgroundColor: 'white',
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ddd',
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px',
  },
  button: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
  buttonPrimary: {
    backgroundColor: '#ff9800',
    color: 'white',
  },
  buttonSecondary: {
    backgroundColor: '#4caf50',
    color: 'white',
  },
  buttonDanger: {
    backgroundColor: '#f44336',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  warning: {
    fontSize: '12px',
    color: '#ff9800',
    backgroundColor: '#fff3e0',
    padding: '8px',
    borderRadius: '4px',
    marginBottom: '16px',
    textAlign: 'center',
  },
  divider: {
    height: '1px',
    backgroundColor: '#ddd',
    marginBottom: '16px',
  },
  links: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  link: {
    padding: '8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    color: '#333',
    transition: 'all 0.2s',
  },
};