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
  autoAiScan: boolean;
  currentDomain: string;
  isWhitelisted: boolean;
  hasApiKey: boolean;
  user?: any;
};

export default function PopupApp() {
  const [state, setState] = useState<PopupState>({
    isAuthenticated: false,
    enabled: true,
    autoAiScan: false,
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
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url || '');
      const domain = url.hostname;

      const { enabled = true, autoAiScan = false, authToken, user } = 
        await browser.storage.local.get(['enabled', 'autoAiScan', 'authToken', 'user']);

      let isAuthenticated = !!(authToken && user);

      if (!isAuthenticated) {
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (tab.url?.includes('pasteproof.com/auth/extension')) {
            // Inject script to read localStorage from auth page
            const results = await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                const token = localStorage.getItem('pasteproof_auth_token');
                const userStr = localStorage.getItem('pasteproof_user');
                return { token, userStr };
              }
            });
            
            if (results[0]?.result?.token) {
              const { token, userStr } = results[0].result;
              const userData = JSON.parse(userStr!);
              
              // Save to extension storage
              await browser.storage.local.set({
                authToken: token,
                user: userData
              });
              
              isAuthenticated = true;
              console.log('✅ Retrieved auth from localStorage!');
            }
          }
        } catch (err) {
          console.log('Could not check auth page localStorage:', err);
        }
      }

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
        autoAiScan,
        currentDomain: domain,
        isWhitelisted,
        hasApiKey: isAuthenticated,
      });
    } catch (error) {
      console.error('Failed to load popup state:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    try {
      const authUrl = `${import.meta.env.VITE_WEB_URL}/auth/extension`;
      
      await browser.tabs.create({ 
        url: authUrl,
        active: true 
      });

      alert('Please sign in on the opened tab. After signing in, reopen this popup to see your authenticated state.');
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

  const toggleAutoAiScan = async () => {
    const newAutoAiScan = !state.autoAiScan;
    await browser.storage.local.set({ autoAiScan: newAutoAiScan });
    setState({ ...state, autoAiScan: newAutoAiScan });
  };

  const toggleWhitelist = async () => {
    if (!state.isAuthenticated) {
      alert('Please sign in first');
      return;
    }

    try {
      const { authToken } = await browser.storage.local.get('authToken');

      if (state.isWhitelisted) {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/whitelist`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });
        const data = await response.json();
        const entry = data.whitelist.find((w: any) => w.domain === state.currentDomain);
       
        if (entry) {
          await fetch(`${import.meta.env.VITE_API_URL}/api/whitelist/${entry.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });
        }
      } else {
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
      <div style={styles.header}>
        <div style={styles.headerIcon}>🛡️</div>
        <div>
          <div style={styles.title}>PasteProof</div>
          <div style={styles.subtitle}>Your copy/paste bodyguard</div>
        </div>
      </div>

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

          <div style={styles.section}>
            <div style={styles.sectionLabel}>Current Site</div>
            <div style={styles.domain}>{state.currentDomain}</div>
          </div>

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

          {/* Auto AI Scan Toggle */}
          <div style={styles.divider} />
          
          <div style={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    🤖 Auto AI Scan
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      backgroundColor: '#9c27b0',
                      color: 'white',
                      padding: '2px 5px',
                      borderRadius: '3px',
                      fontWeight: '600',
                    }}
                  >
                    PREMIUM
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  Automatically scan inputs with AI
                </div>
              </div>
              
              <label style={styles.toggle}>
                <input
                  type="checkbox"
                  checked={state.autoAiScan}
                  onChange={toggleAutoAiScan}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    ...styles.toggleSlider,
                    backgroundColor: state.autoAiScan ? '#9c27b0' : '#ccc',
                  }}
                >
                  <span
                    style={{
                      ...styles.toggleButton,
                      left: state.autoAiScan ? '22px' : '2px',
                    }}
                  />
                </span>
              </label>
            </div>
          </div>

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
  toggle: {
    position: 'relative',
    display: 'inline-block',
    width: '44px',
    height: '24px',
  },
  toggleSlider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    transition: '0.4s',
    borderRadius: '24px',
  },
  toggleButton: {
    position: 'absolute',
    content: '',
    height: '18px',
    width: '18px',
    bottom: '3px',
    backgroundColor: 'white',
    transition: '0.4s',
    borderRadius: '50%',
  },
};