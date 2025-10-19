import { useState, useEffect } from 'react';
import { getApiClient, initializeApiClient } from '@/shared/api-client';
import Logo from '../../assets/icons/pasteproof-48.png'
import pasteproofIcon from '@/assets/icons/pasteproof-48.png';
type User = {
  id: string;
  email: string;
  name?: string;
};


type PopupState = {
  isAuthenticated: boolean;
  enabled: boolean;
  currentDomain: string;
  isWhitelisted: boolean;
  hasApiKey: boolean;
};

export default function PopupApp() {
  const [state, setState] = useState<PopupState>({
    isAuthenticated: false,
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
      const { authToken, user } = await browser.storage.local.get(['authToken', 'user']);
      const isAuthenticated = !!(authToken && user);

      // Check if current site is whitelisted
      let isWhitelisted = false;
      if (isAuthenticated) {
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/api/whitelist/check/${domain}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });
          const data = await response.json();
          isWhitelisted = data.whitelisted;
        } catch (error) {
          console.error('Failed to check whitelist:', error);
        }
      }

      setState({
        isAuthenticated,
        user: user || null,
        enabled,
        currentDomain: domain,
        isWhitelisted,
      });
    } catch (error) {
      console.error('Failed to load popup state:', error);
    } finally {
      setLoading(false);
    }
  };

const signIn = async () => {
  try {
    // Open web portal in new tab for authentication
    const authUrl = `${import.meta.env.VITE_WEB_URL}/auth/extension`;
    
    await browser.tabs.create({ 
      url: authUrl,
      active: true 
    });

    // Show a helpful message
    alert('Please sign in on the opened tab. After signing in, reopen this popup to see your authenticated state.');
    
    // Close popup so user focuses on auth tab
    window.close();
    
  } catch (error) {
    console.error('Sign in error:', error);
    alert('Failed to open sign in page');
  }
};


  const signOut = async () => {
    if (!confirm('Sign out of Paste Proof?')) return;
    
    await browser.storage.local.remove(['authToken', 'user']);
    setState({
      ...state,
      isAuthenticated: false,
      user: null,
    });
  };
  

  const toggleEnabled = async () => {
    const newEnabled = !state.enabled;
    await browser.storage.local.set({ enabled: newEnabled });
    setState({ ...state, enabled: newEnabled });
  };

  const toggleWhitelist = async () => {
    if (!state.isAuthenticated) {
      alert('Please sign in first');
      return;
    }

    try {
      const { authToken } = await browser.storage.local.get('authToken');
      if (!client) return;

      if (state.isWhitelisted) {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/whitelist`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });
        // Remove from whitelist (we need to get the whitelist ID first)
        const whitelist = await await response.json();
        const entry = whitelist.find(w => w.domain === state.currentDomain);
       
        if (entry) {
          await fetch(`${import.meta.env.VITE_API_URL}/api/whitelist/${entry.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });
        }
      } else {
        // Add to whitelist
        await fetch(`${import.meta.env.VITE_API_URL}/api/whitelist`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ domain: state.currentDomain }),
        });
      }

      setState({ ...state, isWhitelisted: !state.isWhitelisted });
    } catch (error) {
      console.error('Failed to toggle whitelist:', error);
      alert('Failed to update whitelist. Please try again.');
    }
  };

  // const openOptions = (tab?: string) => {
  //   const url = tab ? `options.html#${tab}` : 'options.html';
  //   browser.runtime.openOptionsPage();
  // };

  const openDashboard = () => {
    browser.tabs.create({ url: `${import.meta.env.VITE_WEB_URL}/dashboard` });
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
        <img src={pasteproofIcon} alt="PasteProof Logo" height={36} width={36} />
        <div>
          <div style={styles.title}>PasteProof</div>
          <div style={styles.subtitle}>Your copy/paste bodyguard</div>
        </div>
      </div>


            {/* Not Authenticated */}
      {!state.isAuthenticated && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <p style={{ color: '#666', marginBottom: '16px' }}>
            Sign in to unlock Premium features
          </p>
          <button onClick={signIn} style={{ ...styles.button, ...styles.buttonPrimary }}>
            Sign In
          </button>
        </div>
      )}

      {state.isAuthenticated && (
        <>
          {/* Status Badge */}
          <div
            style={{
              ...styles.statusBadge,
              backgroundColor: state.enabled ? '#e8f5e9' : '#ffebee',
            }}
          >
            <div
              style={{
                ...styles.statusDot,
                backgroundColor: state.enabled ? '#4caf50' : '#f44336',
              }}
            />
            <span
              style={{
                color: state.enabled ? '#2e7d32' : '#c62828',
                fontWeight: '600',
              }}
            >
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
            <button onClick={toggleEnabled} style={{ ...styles.button, ...styles.buttonPrimary }}>
              {state.enabled ? '⏸️ Disable' : '▶️ Enable'} Protection
            </button>

            <button
              onClick={toggleWhitelist}
              style={{
                ...styles.button,
                ...(state.isWhitelisted ? styles.buttonDanger : styles.buttonSecondary),
              }}
            >
              {state.isWhitelisted ? '✗ Remove from' : '✓ Add to'} Whitelist
            </button>
          </div>

          {/* Quick Links */}
          <div style={styles.divider} />

          <div style={styles.links}>
            <button onClick={openDashboard} style={styles.link}>
              📊 Dashboard
            </button>
            <button onClick={signOut} style={styles.link}>
              🚪 Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '320px',
    padding: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#fafafa',
    justifyContent: 'center',
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
    fontSize: '11px',
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
    color: 'white',
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