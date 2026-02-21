// src/entrypoints/popup/App.tsx
import { useState, useEffect } from 'react';
import pasteproofIcon from '@/assets/icons/pasteproof-48.png';
import {
  initializeApiClient,
  getApiBaseUrl,
  apiCache,
  type Team,
} from '@/shared/api-client';
import LockIcon from '@mui/icons-material/Lock';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LogoutIcon from '@mui/icons-material/Logout';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SecurityIcon from '@mui/icons-material/Security';
import WifiIcon from '@mui/icons-material/Wifi';

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
  user?: User;
  tokenValid?: boolean;
  tokenError?: string;
};

export default function PopupApp() {
  const [state, setState] = useState<PopupState>({
    isAuthenticated: false,
    enabled: true,
    autoAiScan: false,
    currentDomain: '',
    isWhitelisted: false,
    hasApiKey: false,
    tokenValid: undefined,
    tokenError: undefined,
  });
  const [loading, setLoading] = useState(true);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    loadState();
    loadUserTeams();
  }, []);

  // Auto-validate token when popup opens (for authenticated users)
  useEffect(() => {
    if (state.isAuthenticated && state.tokenValid === undefined) {
      // Auto-validate token in the background
      autoValidateToken();
    }
  }, [state.isAuthenticated]);

  const autoValidateToken = async () => {
    try {
      const authToken = await storage.getItem<string>('local:authToken');
      if (!authToken) return;

      const apiClient = initializeApiClient(authToken);
      const result = await apiClient.validateToken();

      if (!result.valid) {
        // Token is invalid — try a silent refresh before showing a warning
        try {
          const refreshResult = await apiClient.refreshToken();
          await storage.setItem('local:authToken', refreshResult.token);
          initializeApiClient(refreshResult.token);
          console.log('Token refreshed automatically on popup open');
          setState(prev => ({ ...prev, tokenValid: true, tokenError: undefined }));
          return;
        } catch (refreshError) {
          console.warn('Auto-refresh failed:', refreshError);
        }
      }

      setState(prev => ({
        ...prev,
        tokenValid: result.valid,
        tokenError: result.error,
      }));
    } catch (error) {
      console.error('Auto-validation error:', error);
      setState(prev => ({
        ...prev,
        tokenValid: false,
        tokenError: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  };

  const loadUserTeams = async () => {
    try {
      const authToken = await storage.getItem<string>('local:authToken');
      if (!authToken) {
        return;
      }

      const apiClient = initializeApiClient(authToken);
      const userTeams = await apiClient.getTeams();
      setTeams(userTeams);

      // Load saved team ID from storage
      const savedTeamId = await storage.getItem<string>('local:currentTeamId');
      if (savedTeamId) {
        setCurrentTeamId(savedTeamId);
      } else {
        // Also check localStorage as fallback
        const localTeamId = localStorage.getItem('currentTeamId');
        if (localTeamId) {
          setCurrentTeamId(localTeamId);
          await storage.setItem('local:currentTeamId', localTeamId);
        }
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
  };

  const handleTeamChange = async (teamId: string | null) => {
    if (teamId) {
      await storage.setItem('local:currentTeamId', teamId);
      localStorage.setItem('currentTeamId', teamId);
    } else {
      await storage.removeItem('local:currentTeamId');
      localStorage.removeItem('currentTeamId');
    }
    setCurrentTeamId(teamId);

    // Reload policies from new team by refreshing the current tab
    await refreshCurrentTab();
  };

  const loadState = async () => {
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const url = new URL(tab.url || '');
      const domain = url.hostname;

      const enabled = (await storage.getItem<boolean>('local:enabled')) ?? true;
      const storedAutoAiScan =
        (await storage.getItem<boolean>('local:autoAiScan')) ?? null;
      const authToken = await storage.getItem<string>('local:authToken');
      const user = await storage.getItem<any>('local:user');

      let isAuthenticated = !!(authToken && user);

      let autoAiScan = storedAutoAiScan ?? false;

      if (!isAuthenticated) {
        try {
          const [tab] = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tab.url?.includes('pasteproof.com/auth/extension')) {
            // Inject script to read localStorage from auth page
            // Handle both Chrome and Firefox scripting API
            try {
              const results = await browser.scripting.executeScript({
                target: { tabId: tab.id! },
                func: () => {
                  const token = localStorage.getItem('pasteproof_auth_token');
                  const userStr = localStorage.getItem('pasteproof_user');
                  return { token, userStr };
                },
              });

              if (results && results[0]?.result?.token) {
                const { token, userStr } = results[0].result;
                const userData = JSON.parse(userStr!);

                // Save to extension storage
                await storage.setItem('local:authToken', token);
                await storage.setItem('local:user', userData);

                isAuthenticated = true;
              }
            } catch (scriptError) {
              console.log('Scripting API error (may be Firefox):', scriptError);
              // Firefox fallback: try using tabs.executeScript for older versions
              // Modern Firefox should support scripting API with proper permissions
            }
          }
        } catch (err) {
          console.log('Could not check auth page localStorage:', err);
        }
      }

      let isWhitelisted = false;
      if (isAuthenticated && authToken) {
        try {
          const apiClient = initializeApiClient(authToken);
          isWhitelisted = await apiClient.isWhitelisted(domain);
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

      // Reload teams if authenticated
      if (isAuthenticated) {
        loadUserTeams();
      }
    } catch (error) {
      console.error('Failed to load popup state:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrentTab = async () => {
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab.id) {
        await browser.tabs.reload(tab.id);
      }
    } catch (error) {
      console.error('Failed to refresh tab:', error);
    }
  };

  const signIn = async () => {
    try {
      const authUrl = `${import.meta.env.VITE_WEB_URL}/auth/extension`;

      await browser.tabs.create({
        url: authUrl,
        active: true,
      });

      alert(
        'Please sign in on the opened tab. After signing in, reopen this popup to see your authenticated state.'
      );
      window.close();
    } catch (error) {
      console.error('Sign in error:', error);
      alert('Failed to open sign in page');
    }
  };

  const signOut = async () => {
    if (!confirm('Sign out of Paste Proof?')) return;

    await storage.removeItem('local:authToken');
    await storage.removeItem('local:user');
    await storage.removeItem('local:currentTeamId');
    localStorage.removeItem('currentTeamId');

    setState({
      ...state,
      isAuthenticated: false,
      user: null,
    });

    // Clear team state
    setCurrentTeamId(null);
    setTeams([]);

    // Refresh the page after signing out
    await refreshCurrentTab();
  };

  const toggleEnabled = async () => {
    const newEnabled = !state.enabled;
    await storage.setItem('local:enabled', newEnabled);

    setState({ ...state, enabled: newEnabled });

    // Refresh the page after toggling
    await refreshCurrentTab();
  };

  const toggleAutoAiScan = async () => {
    const newAutoAiScan = !state.autoAiScan;
    await storage.setItem('local:autoAiScan', newAutoAiScan);
    setState({ ...state, autoAiScan: newAutoAiScan });

    // Refresh the page after toggling
    await refreshCurrentTab();
  };

  const toggleWhitelist = async () => {
    if (!state.isAuthenticated) {
      alert('Please sign in first');
      return;
    }

    try {
      const authToken = await storage.getItem<string>('local:authToken');
      const baseUrl = getApiBaseUrl();

      // Normalize domain for cache invalidation
      const normalizedDomain = state.currentDomain
        .replace(/^www\./, '')
        .toLowerCase();

      if (state.isWhitelisted) {
        const response = await fetch(`${baseUrl}/v1/whitelist`, {
          headers: {
            'X-API-Key': authToken as string,
          },
        });
        const data = await response.json();
        const entry = data.whitelist.find(
          (w: any) => w.domain === normalizedDomain
        );

        if (entry) {
          const deleteResponse = await fetch(
            `${baseUrl}/v1/whitelist/${entry.id}`,
            {
              method: 'DELETE',
              headers: {
                'X-API-Key': authToken as string,
              },
            }
          );
          if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to remove from whitelist');
          }
        } else {
          console.warn('Whitelist entry not found for domain:', normalizedDomain);
        }
      } else {
        await fetch(`${baseUrl}/v1/whitelist`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': authToken as string,
          },
          body: JSON.stringify({ domain: state.currentDomain }),
        });
      }

      // Invalidate cache for both the original domain and normalized domain
      await apiCache.invalidateWhitelistCheck(state.currentDomain);
      await apiCache.invalidateWhitelistCheck(normalizedDomain);

      setState({ ...state, isWhitelisted: !state.isWhitelisted });

      // Refresh the page after toggling whitelist
      await refreshCurrentTab();
    } catch (error) {
      console.error('Failed to toggle whitelist:', error);
      alert('Failed to update whitelist. Please try again.');
    }
  };

  const openDashboard = () => {
    browser.tabs.create({ url: `${import.meta.env.VITE_WEB_URL}/dashboard` });
  };

  const testConnection = async () => {
    try {
      setState(prev => ({ ...prev, tokenValid: undefined, tokenError: undefined }));
      
      const authToken = await storage.getItem<string>('local:authToken');
      if (!authToken) {
        setState(prev => ({
          ...prev,
          tokenValid: false,
          tokenError: 'No authentication token found',
        }));
        return;
      }

      const apiClient = initializeApiClient(authToken);
      const result = await apiClient.validateToken();

      setState(prev => ({
        ...prev,
        tokenValid: result.valid,
        tokenError: result.error,
        user: result.user || prev.user,
      }));

      if (result.valid) {
        alert('✓ Connection successful! Your authentication token is valid.');
      } else {
        // Try refreshing first before asking the user to sign in
        try {
          setState(prev => ({ ...prev, tokenValid: undefined, tokenError: 'Refreshing token…' }));
          const refreshResult = await apiClient.refreshToken();
          await storage.setItem('local:authToken', refreshResult.token);
          initializeApiClient(refreshResult.token);
          setState(prev => ({ ...prev, tokenValid: true, tokenError: undefined }));
          alert('✓ Token refreshed! Your session has been renewed automatically.');
          return;
        } catch (refreshError) {
          console.warn('Token refresh failed during test:', refreshError);
        }

        // Refresh failed — prompt re-authentication
        setState(prev => ({
          ...prev,
          tokenValid: false,
          tokenError: result.error,
        }));
        const shouldReauth = confirm(
          `✗ Connection failed: ${result.error || 'Unknown error'}\n\n` +
          'Your token could not be refreshed automatically.\n\n' +
          'Would you like to sign in again now?'
        );
        if (shouldReauth) {
          await promptReAuthentication();
        }
      }
    } catch (error) {
      console.error('Failed to test connection:', error);
      setState(prev => ({
        ...prev,
        tokenValid: false,
        tokenError: error instanceof Error ? error.message : 'Unknown error',
      }));

      const shouldReauth = confirm(
        `✗ Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
        'Would you like to sign in again now?'
      );
      if (shouldReauth) {
        await promptReAuthentication();
      }
    }
  };

  const promptReAuthentication = async () => {
    try {
      // Clear existing auth data
      await storage.removeItem('local:authToken');
      await storage.removeItem('local:user');
      await storage.removeItem('local:currentTeamId');
      localStorage.removeItem('currentTeamId');

      // Clear API cache
      await apiCache.clearAll();

      // Open sign-in page
      const authUrl = `${import.meta.env.VITE_WEB_URL}/auth/extension`;
      await browser.tabs.create({
        url: authUrl,
        active: true,
      });

      alert(
        'Please sign in on the opened tab.\n\n' +
        'After signing in, reopen this popup to verify your connection.'
      );
      
      window.close();
    } catch (error) {
      console.error('Failed to prompt re-authentication:', error);
      alert('Failed to open sign-in page. Please try again.');
    }
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
        <img
          alt="pasteproof icon"
          src={pasteproofIcon}
          width={28}
          height={28}
        />
        <div>
          <div style={styles.title}>PasteProof</div>
          <div style={styles.subtitle}>Your copy/paste bodyguard</div>
        </div>
      </div>

      {!state.isAuthenticated && (
        <div style={styles.authContainer}>
          <div style={styles.authIcon}>
            <LockIcon sx={{ fontSize: 36, color: '#ff9800' }} />
          </div>
          <p style={styles.authText}>Sign in to unlock Premium features</p>
          <button
            onClick={signIn}
            style={{
              ...styles.button,
              ...styles.buttonPrimary,
              width: 'auto',
              minWidth: '120px',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#fb8c00';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow =
                '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#ff9800';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow =
                '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
            }}
          >
            Sign In
          </button>
        </div>
      )}

      {state.isAuthenticated && (
        <>
          {/* Invalid Token Warning Banner */}
          {state.tokenValid === false && (
            <div style={styles.warningBanner}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <LockIcon sx={{ fontSize: 18, color: '#ef4444' }} />
                <span style={{ fontWeight: '600', fontSize: '13px', color: '#991b1b' }}>
                  Authentication Issue Detected
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#7f1d1d', marginBottom: '8px', lineHeight: '1.4' }}>
                Your authentication token is invalid or expired. Some features may not work.
              </div>
              <button
                onClick={promptReAuthentication}
                style={{
                  ...styles.button,
                  backgroundColor: '#ef4444',
                  color: 'white',
                  fontSize: '12px',
                  padding: '6px 12px',
                  width: '100%',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = '#ef4444';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <LockIcon sx={{ fontSize: 12, marginRight: '4px' }} />
                Sign In Again
              </button>
            </div>
          )}

          <div
                style={{
                  ...styles.statusBadge,
                  backgroundColor: state.enabled ? '#ecfdf5' : '#fef2f2',
                }}
              >
                <SecurityIcon
                  sx={{
                    fontSize: 16,
                    color: state.enabled ? '#10b981' : '#ef4444',
                  }}
                />
                <span
                  style={{
                    color: state.enabled ? '#065f46' : '#991b1b',
                    fontWeight: '600',
                    fontSize: '13px',
                  }}
                >
                  {state.enabled ? 'Protection Active' : 'Protection Disabled'}
                </span>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>Current Site</div>
                <div style={styles.domain}>{state.currentDomain}</div>
              </div>

              {/* Team Selector */}
              {teams.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionLabel}>Team</div>
                  <select
                    value={currentTeamId || ''}
                    onChange={e => handleTeamChange(e.target.value || null)}
                    style={styles.select}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = '#ff9800';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                      e.currentTarget.style.boxShadow =
                        '0 0 0 3px rgba(255, 152, 0, 0.1)';
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <option value="">Personal Account</option>
                    {teams.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={styles.controls}>
                <button
                  onClick={toggleEnabled}
                  style={{ ...styles.button, ...styles.buttonPrimary }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = '#fb8c00';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow =
                      '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = '#ff9800';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow =
                      '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }}
                >
                  {state.enabled ? (
                    <>
                      <PauseIcon
                        sx={{
                          fontSize: 14,
                          marginRight: '5px',
                          verticalAlign: 'middle',
                          lineHeight: 1,
                        }}
                      />
                      Disable Protection
                    </>
                  ) : (
                    <>
                      <PlayArrowIcon
                        sx={{
                          fontSize: 14,
                          marginRight: '5px',
                          verticalAlign: 'middle',
                          lineHeight: 1,
                        }}
                      />
                      Enable Protection
                    </>
                  )}
                </button>

                <button
                  onClick={toggleWhitelist}
                  style={{
                    ...styles.button,
                    ...(state.isWhitelisted
                      ? styles.buttonDanger
                      : styles.buttonSecondary),
                  }}
                  onMouseEnter={e => {
                    if (state.isWhitelisted) {
                      e.currentTarget.style.backgroundColor = '#dc2626';
                    } else {
                      e.currentTarget.style.backgroundColor = '#059669';
                    }
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow =
                      '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={e => {
                    if (state.isWhitelisted) {
                      e.currentTarget.style.backgroundColor = '#ef4444';
                    } else {
                      e.currentTarget.style.backgroundColor = '#10b981';
                    }
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow =
                      '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }}
                >
                  {state.isWhitelisted ? (
                    <>
                      <CancelIcon
                        sx={{
                          fontSize: 14,
                          marginRight: '5px',
                          verticalAlign: 'middle',
                          lineHeight: 1,
                        }}
                      />
                      Remove from Whitelist
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon
                        sx={{
                          fontSize: 14,
                          marginRight: '5px',
                          verticalAlign: 'middle',
                          lineHeight: 1,
                        }}
                      />
                      Add to Whitelist
                    </>
                  )}
                </button>
              </div>

              {/* Auto AI Scan Toggle */}
              <div style={styles.divider} />

              <div style={styles.section}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginBottom: '3px',
                      }}
                    >
                      <SmartToyIcon
                        sx={{
                          fontSize: 14,
                          color: '#9c27b0',
                          marginRight: '3px',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#333',
                        }}
                      >
                        Auto AI Scan
                      </span>
                      <span
                        style={{
                          fontSize: '8px',
                          backgroundColor: '#9c27b0',
                          color: 'white',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          fontWeight: '600',
                        }}
                      >
                        PREMIUM
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#666' }}>
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
                <button
                  onClick={openDashboard}
                  style={styles.link}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <DashboardIcon sx={{ fontSize: 14, marginRight: '5px' }} />
                  Dashboard
                </button>
                <button
                  onClick={signOut}
                  style={styles.link}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <LogoutIcon sx={{ fontSize: 14, marginRight: '5px' }} />
                  Sign Out
                </button>
              </div>

              {/* Test Connection Button */}
              <div style={{ marginTop: '8px' }}>
                <button
                  onClick={testConnection}
                  style={{
                    ...styles.link,
                    width: '100%',
                    backgroundColor: state.tokenValid === true ? '#ecfdf5' : state.tokenValid === false ? '#fef2f2' : 'white',
                    borderColor: state.tokenValid === true ? '#10b981' : state.tokenValid === false ? '#ef4444' : '#e5e7eb',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = state.tokenValid === true ? '#d1fae5' : state.tokenValid === false ? '#fee2e2' : '#f9fafb';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = state.tokenValid === true ? '#ecfdf5' : state.tokenValid === false ? '#fef2f2' : 'white';
                  }}
                >
                  <WifiIcon sx={{ 
                    fontSize: 14, 
                    marginRight: '5px',
                    color: state.tokenValid === true ? '#10b981' : state.tokenValid === false ? '#ef4444' : '#6b7280'
                  }} />
                  <span style={{
                    color: state.tokenValid === true ? '#065f46' : state.tokenValid === false ? '#991b1b' : '#374151'
                  }}>
                    {state.tokenValid === true ? 'Connection OK' : state.tokenValid === false ? 'Connection Failed' : 'Test Connection'}
                  </span>
                </button>
                {state.tokenError && (
                  <div>
                    <div style={{
                      fontSize: '10px',
                      color: '#ef4444',
                      marginTop: '4px',
                      padding: '4px 8px',
                      backgroundColor: '#fef2f2',
                      borderRadius: '4px',
                      border: '1px solid #fee2e2',
                      marginBottom: '6px',
                    }}>
                      {state.tokenError}
                    </div>
                    <button
                      onClick={promptReAuthentication}
                      style={{
                        ...styles.button,
                        backgroundColor: '#ef4444',
                        color: 'white',
                        fontSize: '12px',
                        padding: '6px 12px',
                        width: '100%',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = '#dc2626';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '#ef4444';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <LockIcon sx={{ fontSize: 12, marginRight: '4px' }} />
                      Sign In Again
                    </button>
                  </div>
                )}
              </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '360px',
    padding: '12px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: '#ffffff',
    minHeight: '240px',
  },
  loading: {
    textAlign: 'center',
    padding: '24px 12px',
    color: '#6b7280',
    fontSize: '14px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '14px',
    paddingBottom: '10px',
    borderBottom: '1px solid #e5e7eb',
  },
  headerIcon: {
    fontSize: '36px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#111827',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '11px',
    color: '#6b7280',
    fontWeight: '400',
  },
  statusBadge: {
    padding: '8px 10px',
    borderRadius: '6px',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  section: {
    marginBottom: '12px',
  },
  sectionLabel: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6b7280',
    marginBottom: '5px',
    fontWeight: '600',
  },
  domain: {
    fontSize: '13px',
    color: '#111827',
    fontWeight: '500',
    backgroundColor: '#f9fafb',
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    fontFamily: 'monospace',
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '12px',
  },
  button: {
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  buttonPrimary: {
    backgroundColor: '#ff9800',
    color: 'white',
  },
  buttonPrimaryHover: {
    backgroundColor: '#fb8c00',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  buttonSecondary: {
    backgroundColor: '#10b981',
    color: 'white',
  },
  buttonSecondaryHover: {
    backgroundColor: '#059669',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
    color: 'white',
  },
  buttonDangerHover: {
    backgroundColor: '#dc2626',
  },
  divider: {
    height: '1px',
    backgroundColor: '#e5e7eb',
    marginBottom: '12px',
    marginTop: '2px',
  },
  links: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
  },
  link: {
    padding: '6px 8px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
    color: '#374151',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkHover: {
    backgroundColor: '#f9fafb',
    borderColor: '#d1d5db',
  },
  toggle: {
    position: 'relative',
    display: 'inline-block',
    width: '48px',
    height: '26px',
  },
  toggleSlider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    transition: '0.3s ease',
    borderRadius: '26px',
  },
  toggleButton: {
    position: 'absolute',
    content: '',
    height: '20px',
    width: '20px',
    bottom: '3px',
    backgroundColor: 'white',
    transition: '0.3s ease',
    borderRadius: '50%',
    boxShadow: '0 2px 4px 0 rgba(0, 0, 0, 0.2)',
  },
  select: {
    width: '100%',
    padding: '6px 10px',
    fontSize: '13px',
    color: '#111827',
    fontWeight: '500',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    transition: 'all 0.2s ease',
    outline: 'none',
  },
  authContainer: {
    textAlign: 'center',
    padding: '20px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  authIcon: {
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'center',
  },
  authText: {
    color: '#6b7280',
    marginBottom: '12px',
    fontSize: '13px',
    lineHeight: '1.4',
  },
  warningBanner: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fee2e2',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '12px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
};
