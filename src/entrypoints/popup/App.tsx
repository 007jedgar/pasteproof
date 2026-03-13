// src/entrypoints/popup/App.tsx
import { useState, useEffect } from 'react';
import pasteproofIcon from '@/assets/icons/pasteproof-48.png';
import {
  initializeApiClient,
  getApiBaseUrl,
  apiCache,
  type Team,
  type SiteScanResult,
  type PhishingAnalysis,
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
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import GppBadIcon from '@mui/icons-material/GppBad';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import PhishingIcon from '@mui/icons-material/Phishing';

type User = {
  id: string;
  email: string;
  name?: string;
};

const RISK_COLORS = {
  critical: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', chipBg: '#fee2e2', icon: '🚨', label: 'Scam Detected' },
  high:     { bg: '#fff7ed', border: '#fed7aa', text: '#92400e', chipBg: '#fef3c7', icon: '⚠️', label: 'Suspicious Message' },
  medium:   { bg: '#fffbeb', border: '#fde68a', text: '#78350f', chipBg: '#fef9c3', icon: '⚠️', label: 'Potentially Suspicious' },
  low:      { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', chipBg: '#d1fae5', icon: '✅', label: 'No Threats Found' },
} as const;

function PhishingScanResult({ analysis }: { analysis: PhishingAnalysis }) {
  const c = RISK_COLORS[analysis.riskLevel as keyof typeof RISK_COLORS] ?? RISK_COLORS.medium;
  const indicators = analysis.indicators ?? [];
  return (
    <div
      style={{
        marginTop: '8px',
        padding: '10px 12px',
        backgroundColor: c.bg,
        borderRadius: '6px',
        border: `1px solid ${c.border}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: analysis.aiAnalysis?.recommendation ? '6px' : 0,
        }}
      >
        <span style={{ fontSize: '13px' }}>{c.icon}</span>
        <span style={{ fontWeight: '600', fontSize: '12px', color: c.text }}>{c.label}</span>
        <span style={{ fontSize: '10px', color: c.text, marginLeft: 'auto', opacity: 0.8 }}>
          {analysis.riskScore}/100 · {analysis.confidence}% conf.
        </span>
      </div>
      {analysis.aiAnalysis?.recommendation && (
        <div style={{ fontSize: '11px', color: c.text, lineHeight: 1.45, marginBottom: indicators.length ? '6px' : 0 }}>
          {analysis.aiAnalysis.recommendation}
        </div>
      )}
      {indicators.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {indicators.slice(0, 4).map((ind, i) => (
            <span
              key={i}
              title={ind.description}
              style={{
                fontSize: '10px',
                backgroundColor: c.chipBg,
                color: c.text,
                padding: '2px 7px',
                borderRadius: '10px',
              }}
            >
              {ind.type.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type PopupState = {
  isAuthenticated: boolean;
  enabled: boolean;
  autoAiScan: boolean;
  currentDomain: string;
  currentUrl: string;
  isWhitelisted: boolean;
  hasApiKey: boolean;
  user?: User;
};

export default function PopupApp() {
  const [state, setState] = useState<PopupState>({
    isAuthenticated: false,
    enabled: true,
    autoAiScan: false,
    currentDomain: '',
    currentUrl: '',
    isWhitelisted: false,
    hasApiKey: false,
  });
  const [loading, setLoading] = useState(true);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [siteScan, setSiteScan] = useState<SiteScanResult | null>(null);
  const [siteScanLoading, setSiteScanLoading] = useState(false);
  const [phishingScan, setPhishingScan] = useState<PhishingAnalysis | null>(null);
  const [phishingScanLoading, setPhishingScanLoading] = useState(false);
  const [phishingScanError, setPhishingScanError] = useState<string | null>(null);

  useEffect(() => {
    loadState();
    loadUserTeams();
  }, []);

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
        currentUrl: tab.url || '',
        isWhitelisted,
        hasApiKey: isAuthenticated,
      });

      // Reload teams if authenticated
      if (isAuthenticated) {
        loadUserTeams();
      }

      // Run site safety scan if authenticated
      if (isAuthenticated && authToken && tab.url) {
        runSiteScan(authToken, tab.url, tab.id);
      }
    } catch (error) {
      console.error('Failed to load popup state:', error);
    } finally {
      setLoading(false);
    }
  };

  const runSiteScan = async (
    authToken: string,
    url: string,
    tabId?: number
  ) => {
    setSiteScanLoading(true);
    try {
      const apiClient = initializeApiClient(authToken);
      const result = await apiClient.scanUrl({ url });
      setSiteScan(result);
      if (tabId != null) {
        await updateBadgeIcon(result?.verdict ?? null, tabId);
      }
    } catch (error) {
      console.error('Site scan failed:', error);
      setSiteScan(null);
    } finally {
      setSiteScanLoading(false);
    }
  };

  const scanForScams = async () => {
    setPhishingScan(null);
    setPhishingScanError(null);
    setPhishingScanLoading(true);
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) {
        setPhishingScanError('No active tab found.');
        return;
      }
      type ScanResponse = { result: PhishingAnalysis | null; error?: string };
      let response: ScanResponse | undefined;
      try {
        response = await browser.tabs.sendMessage(tab.id, {
          action: 'scanForScams',
        });
      } catch {
        setPhishingScanError(
          'Could not reach the page. Try reloading the tab first.'
        );
        return;
      }
      setPhishingScan(response?.result ?? null);
      if (!response?.result) {
        if (response?.error === 'unauthenticated') {
          setPhishingScanError('Sign in to use Scam Scan.');
        } else if (response?.error === 'no_content') {
          setPhishingScanError('No content found to scan on this page.');
        } else {
          setPhishingScanError('Scan failed. Please try again.');
        }
      }
    } catch (error) {
      console.error('Scan for scams failed:', error);
      setPhishingScanError('Scan failed. Please try again.');
    } finally {
      setPhishingScanLoading(false);
    }
  };

  const updateBadgeIcon = async (
    verdict: 'SAFE' | 'SUSPICIOUS' | 'MALICIOUS' | null,
    tabId: number
  ) => {
    try {
      const size = 48;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Draw the base extension icon
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, size, size);
          resolve();
        };
        img.onerror = reject;
        img.src = pasteproofIcon;
      });

      // Overlay an emoji in the bottom-right corner
      if (verdict) {
        const emoji = {
          SAFE: '✅',
          SUSPICIOUS: '⚠️',
          MALICIOUS: '⛔',
        }[verdict];
        ctx.font = '22px serif';
        ctx.fillText(emoji, size - 24, size - 1);
      }

      const imageData = ctx.getImageData(0, 0, size, size);
      await browser.action.setIcon({
        imageData: { 48: imageData } as any,
        tabId,
      });
    } catch (error) {
      console.warn('Failed to update icon:', error);
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
      await browser.tabs.create({
        url: `${import.meta.env.VITE_WEB_URL}/auth/extension`,
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

  const signUp = async () => {
    try {
      await browser.tabs.create({
        url: `${import.meta.env.VITE_WEB_URL}/auth/signup`,
        active: true,
      });
      window.close();
    } catch (error) {
      console.error('Sign up error:', error);
      alert('Failed to open sign up page');
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
    setSiteScan(null);

    // Reset icon to base (no overlay)
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab.id != null) await updateBadgeIcon(null, tab.id);
    } catch {}

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
            throw new Error(
              errorData.error || 'Failed to remove from whitelist'
            );
          }
        } else {
          console.warn(
            'Whitelist entry not found for domain:',
            normalizedDomain
          );
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
        <div style={styles.unauthContainer}>
          {/* Basic protection active */}
          <div
            style={{
              ...styles.statusBadge,
              backgroundColor: '#ecfdf5',
              marginBottom: '14px',
            }}
          >
            <SecurityIcon sx={{ fontSize: 16, color: '#10b981' }} />
            <span
              style={{ color: '#065f46', fontWeight: '600', fontSize: '13px' }}
            >
              Basic Protection Active
            </span>
          </div>

          {/* Upgrade prompt */}
          <div style={styles.upgradeCard}>
            <div style={styles.upgradeHeader}>
              <CardGiftcardIcon sx={{ fontSize: 18, color: '#ff9800' }} />
              <span style={styles.upgradeTitle}>
                Sign up free — unlock more
              </span>
            </div>
            <p style={styles.upgradeSubtext}>
              You're protected by pattern detection, but a free account gives
              you access to:
            </p>
            <ul style={styles.featureList}>
              {[
                'Site safety scanning (scam & phishing detection)',
                'Custom detection patterns',
                'Trusted sites (whitelist)',
                'Beta features as they ship',
              ].map(feature => (
                <li key={feature} style={styles.featureItem}>
                  <CheckCircleIcon
                    sx={{
                      fontSize: 13,
                      color: '#10b981',
                      flexShrink: 0,
                      marginTop: '1px',
                    }}
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={signUp}
              style={{
                ...styles.button,
                ...styles.buttonPrimary,
                width: '100%',
                marginBottom: '8px',
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
              Create Free Account
            </button>

            <button
              onClick={signIn}
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
              Already have an account? Sign in
            </button>
          </div>
        </div>
      )}

      {state.isAuthenticated && (
        <>
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

          {/* Site Safety Section */}
          {siteScanLoading && (
            <div style={styles.siteSafetyLoading}>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>
                Checking site safety...
              </span>
            </div>
          )}

          {!siteScanLoading && siteScan && (
            <>
              {siteScan.verdict === 'SAFE' && (
                <div style={styles.siteSafeBadge}>
                  <VerifiedUserIcon sx={{ fontSize: 16, color: '#065f46' }} />
                  <div>
                    <div
                      style={{
                        fontWeight: '600',
                        fontSize: '12px',
                        color: '#065f46',
                      }}
                    >
                      Site Verified
                    </div>
                    <div style={{ fontSize: '10px', color: '#047857' }}>
                      No threats detected on this site
                    </div>
                  </div>
                </div>
              )}

              {siteScan.verdict === 'SUSPICIOUS' && (
                <div style={styles.siteSuspiciousBadge}>
                  <WarningAmberIcon sx={{ fontSize: 16, color: '#92400e' }} />
                  <div>
                    <div
                      style={{
                        fontWeight: '600',
                        fontSize: '12px',
                        color: '#92400e',
                      }}
                    >
                      Site Flagged as Suspicious
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#78350f',
                        lineHeight: '1.4',
                      }}
                    >
                      Proceed with caution — this site may be untrustworthy
                    </div>
                    {siteScan.flags.length > 0 && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#78350f',
                          marginTop: '4px',
                        }}
                      >
                        Flags: {siteScan.flags.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {siteScan.verdict === 'MALICIOUS' && (
                <div style={styles.siteMaliciousBadge}>
                  <GppBadIcon
                    sx={{ fontSize: 20, color: '#7f1d1d', flexShrink: 0 }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: '700',
                        fontSize: '13px',
                        color: '#7f1d1d',
                        marginBottom: '3px',
                      }}
                    >
                      Warning: Potential Scam or Phishing Site
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#991b1b',
                        lineHeight: '1.4',
                      }}
                    >
                      This site has been identified as potentially malicious.
                      Avoid entering any personal information.
                    </div>
                    {siteScan.flags.length > 0 && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#b91c1c',
                          marginTop: '5px',
                        }}
                      >
                        Flags: {siteScan.flags.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Scan for Scams */}
          <div style={{ marginBottom: '12px' }}>
            <button
              onClick={scanForScams}
              disabled={phishingScanLoading}
              style={{
                ...styles.button,
                width: '100%',
                backgroundColor: '#1e3a5f',
                color: 'white',
                opacity: phishingScanLoading ? 0.7 : 1,
                cursor: phishingScanLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => {
                if (!phishingScanLoading) {
                  e.currentTarget.style.backgroundColor = '#16304f';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#1e3a5f';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <PhishingIcon
                sx={{ fontSize: 14, marginRight: '5px', verticalAlign: 'middle' }}
              />
              {phishingScanLoading ? 'Scanning messages…' : 'Scan for Scams'}
            </button>

            {phishingScanError && !phishingScan && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '9px 12px',
                  backgroundColor: '#fafafa',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  fontSize: '11px',
                  color: '#6b7280',
                }}
              >
                {phishingScanError}
              </div>
            )}

            {phishingScan && (
              <PhishingScanResult analysis={phishingScan} />
            )}
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
  siteSafetyLoading: {
    padding: '8px 10px',
    borderRadius: '6px',
    marginBottom: '12px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  siteSafeBadge: {
    padding: '8px 10px',
    borderRadius: '6px',
    marginBottom: '12px',
    backgroundColor: '#ecfdf5',
    border: '1px solid #a7f3d0',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  siteSuspiciousBadge: {
    padding: '10px',
    borderRadius: '6px',
    marginBottom: '12px',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  siteMaliciousBadge: {
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '12px',
    backgroundColor: '#fef2f2',
    border: '2px solid #fca5a5',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    boxShadow: '0 2px 4px 0 rgba(239, 68, 68, 0.15)',
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
  unauthContainer: {
    display: 'flex',
    flexDirection: 'column',
  },
  upgradeCard: {
    backgroundColor: '#fffbf5',
    border: '1px solid #fed7aa',
    borderRadius: '8px',
    padding: '12px',
  },
  upgradeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  upgradeTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#92400e',
  },
  upgradeSubtext: {
    fontSize: '11px',
    color: '#78350f',
    margin: '0 0 10px 0',
    lineHeight: '1.5',
  },
  featureList: {
    listStyle: 'none',
    margin: '0 0 12px 0',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    fontSize: '11px',
    color: '#374151',
    lineHeight: '1.4',
  },
};
