// src/entrypoints/options/App.tsx
import { useState, useEffect } from 'react';
import { initializeApiClient, getApiClient, WhitelistSite } from '@/shared/api-client';
import { CustomPattern } from '@/shared/pii-detector';
import Dashboard from './Dashboard';
import PasteProofIcon from '@/assets/icons/pasteproof-48.png';

export default function OptionsApp() {
  const [authToken, setAuthToken] = useState('');
  const [savedAuthToken, setSavedAuthToken] = useState('');
  const [patterns, setPatterns] = useState<CustomPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [whitelist, setWhitelist] = useState<WhitelistSite[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [autoAiScan, setAutoAiScan] = useState(false);
  const [extensionEnabled, setExtensionEnabled] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'dashboard') return 'dashboard';
    if (hash === 'patterns') return 'patterns';
    if (hash === 'whitelist') return 'whitelist';
    return 'settings';
  };

  const [activeTab, setActiveTab] = useState<"settings" | "whitelist" | "patterns" | "dashboard">(getInitialTab());

  const [newPattern, setNewPattern] = useState({
    name: '',
    pattern: '',
    pattern_type: '',
    description: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'dashboard' || hash === 'patterns' || hash === 'settings' || hash === 'whitelist') {
        setActiveTab(hash as any);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const loadWhitelist = async (token: string) => {
    try {
      const client = initializeApiClient(token);
      const sites = await client.getWhitelist();
      setWhitelist(sites);
    } catch (err) {
      console.error('Failed to load whitelist:', err);
    }
  };

  const loadSettings = async () => {
    const token = await storage.getItem<string>('local:authToken');
    console.log('token', token)
    const autoAiScan = await storage.getItem<boolean>('local:autoAiScan') ?? false;
    const enabled = await storage.getItem<boolean>('local:enabled') ?? true;
    const user = await storage.getItem<any>('local:user');

    if (token) {
      setAuthToken(token);
      setSavedAuthToken(token);
      
      // Load user info
      if (user) {
        setUserEmail(user.email || '');
      }

      await Promise.all([
        loadPatterns(token),
        loadWhitelist(token)
      ]);
    }

    setAutoAiScan(autoAiScan !== false);
    setExtensionEnabled(enabled !== false);
  };

  const addDomain = async () => {
    try {
      setLoading(true);
      setError('');

      const client = getApiClient();
      if (!client) {
        setError('Please sign in first');
        return;
      }

      await client.addToWhitelist(newDomain);
      setSuccess('✅ Domain added to whitelist!');
      setNewDomain('');
      await loadWhitelist(savedAuthToken);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(`Failed to add domain: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const removeDomain = async (whitelistId: string) => {
    if (!confirm('Remove this domain from whitelist?')) return;

    try {
      setLoading(true);
      const client = getApiClient();
      if (!client) return;

      await client.removeFromWhitelist(whitelistId);
      await loadWhitelist(savedAuthToken);
      setSuccess('✅ Domain removed!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(`Failed to remove domain: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const loadPatterns = async (token: string) => {
    try {
      setLoading(true);
      const client = initializeApiClient(token);
      const fetchedPatterns = await client.getPatterns();
      setPatterns(fetchedPatterns);
    } catch (err) {
      console.error('Failed to load patterns:', err);
      setError(`Failed to load patterns: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const openAuthPage = () => {
    const authUrl = 'https://pasteproof.com/auth/signin?extension=true';
    browser.tabs.create({ url: authUrl });
  };

  const signOut = async () => {
    if (!confirm('Sign out of Paste Proof?')) return;

    await storage.removeItem('local:authToken');
    await storage.removeItem('local:user');
    setAuthToken('');
    setSavedAuthToken('');
    setUserEmail('');
    setPatterns([]);
    setWhitelist([]);
    setSuccess('✅ Signed out successfully');
    setTimeout(() => setSuccess(''), 3000);
  };

  const toggleAutoAiScan = async (checked: boolean) => {
    setAutoAiScan(checked);
    await storage.setItem('local:autoAiScan', checked);

    setSuccess('✅ Auto AI Scan ' + (checked ? 'enabled' : 'disabled'));
    setTimeout(() => setSuccess(''), 2000);
  };

  const toggleExtensionEnabled = async (checked: boolean) => {
    setExtensionEnabled(checked);
    await storage.setItem('local:enabled', checked);
    
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        browser.tabs.reload(tab.id);
      }
    }
    
    setSuccess('✅ Extension ' + (checked ? 'enabled' : 'disabled'));
    setTimeout(() => setSuccess(''), 2000);
  };

  const createPattern = async () => {
    try {
      setLoading(true);
      setError('');

      const client = getApiClient();
      if (!client) {
        setError('Please sign in first');
        return;
      }

      try {
        new RegExp(newPattern.pattern);
      } catch {
        setError('Invalid regex pattern');
        return;
      }

      await client.createPattern(newPattern);

      setSuccess('✅ Pattern created!');
      setNewPattern({
        name: '',
        pattern: '',
        pattern_type: '',
        description: '',
      });

      await loadPatterns(savedAuthToken);

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(`Failed to create pattern: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const deletePattern = async (patternId: string) => {
    if (!confirm('Delete this pattern?')) return;

    try {
      setLoading(true);
      const client = getApiClient();
      if (!client) return;

      await client.deletePattern(patternId);
      await loadPatterns(savedAuthToken);
      setSuccess('✅ Pattern deleted!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(`Failed to delete pattern: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: '40px',
        maxWidth: '1200px',
        margin: '0 auto',
        fontFamily: 'system-ui',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src={PasteProofIcon}  width={48} height={48}/>
          <div>
            <h1 style={{ margin: 0 }}>Paste Proof</h1>
            <p style={{ margin: '4px 0 0 0', color: '#666' }}>Your pasteboard bodyguard</p>
          </div>
        </div>

        {/* User info / Sign in button */}
        {savedAuthToken ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
              Signed in as
            </div>
            <div style={{ fontWeight: '600', marginBottom: '8px' }}>{userEmail}</div>
            <button
              onClick={signOut}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={openAuthPage}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Sign In
          </button>
        )}
      </div>

      {/* Show messages */}
      {error && (
        <div
          style={{
            padding: '12px',
            marginBottom: '20px',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '4px',
            border: '1px solid #ef9a9a',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '12px',
            marginBottom: '20px',
            backgroundColor: '#e8f5e9',
            color: '#2e7d32',
            borderRadius: '4px',
            border: '1px solid #81c784',
          }}
        >
          {success}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '32px',
          borderBottom: '2px solid #e0e0e0',
        }}
      >
        <TabButton
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Settings
        </TabButton>
        <TabButton
          active={activeTab === 'whitelist'}
          onClick={() => setActiveTab('whitelist')}
          disabled={!savedAuthToken}
        >
          ✓ Whitelisted Sites
        </TabButton>
        <TabButton
          active={activeTab === 'patterns'}
          onClick={() => setActiveTab('patterns')}
          disabled={!savedAuthToken}
        >
          🔍 Custom Patterns
        </TabButton>
        <TabButton
          active={activeTab === 'dashboard'}
          onClick={() => setActiveTab('dashboard')}
          disabled={!savedAuthToken}
        >
          📊 Dashboard
        </TabButton>
      </div>

      {activeTab === 'settings' && (
        <>
          {/* Sign In Prompt */}
          {!savedAuthToken && (
            <div
              style={{
                marginBottom: '24px',
                padding: '30px',
                border: '2px dashed #ff9800',
                borderRadius: '8px',
                backgroundColor: '#fff3e0',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔐</div>
              <h2 style={{ margin: '0 0 8px 0' }}>Sign in to unlock Premium features</h2>
              <p style={{ color: '#666', marginBottom: '20px' }}>
                Get access to custom patterns, AI detection, analytics, and more
              </p>
              <button
                onClick={openAuthPage}
                style={{
                  padding: '12px 32px',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                }}
              >
                Sign In with Paste Proof
              </button>
            </div>
          )}

          {/* Extension Enable/Disable */}
          <div
            style={{
              marginBottom: '24px',
              padding: '20px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              backgroundColor: '#f8f9fa',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Extension Status</h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                backgroundColor: 'white',
                borderRadius: '6px',
              }}
            >
              <div>
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                  Enable Extension
                </div>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  Turn PII detection on or off globally
                </div>
              </div>
              <ToggleSwitch
                checked={extensionEnabled}
                onChange={toggleExtensionEnabled}
                color="#4caf50"
              />
            </div>
          </div>

          {/* Auto AI Scan Setting */}
          {savedAuthToken && (
            <div
              style={{
                marginBottom: '24px',
                padding: '20px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                backgroundColor: '#f3e5f5',
              }}
            >
              <h2 style={{ marginTop: 0 }}>AI Detection</h2>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                    Automatic AI Scanning
                  </div>
                  <div style={{ fontSize: '13px', color: '#666' }}>
                    Use AI to detect sensitive information automatically
                  </div>
                </div>
                <ToggleSwitch
                  checked={autoAiScan}
                  onChange={toggleAutoAiScan}
                  color="#9c27b0"
                />
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'whitelist' && (
        <div>
          <h2>Whitelisted Sites</h2>
          <p style={{ color: '#666' }}>
            Sites on this list will bypass PII detection
          </p>

          <div style={{ marginBottom: '20px', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              placeholder="example.com"
              style={{
                flex: 1,
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
            <button
              onClick={addDomain}
              disabled={loading || !newDomain}
              style={{
                padding: '10px 20px',
                backgroundColor: '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              Add Domain
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {whitelist.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
                No whitelisted sites yet
              </p>
            ) : (
              whitelist.map(site => (
                <div
                  key={site.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                  }}
                >
                  <span style={{ fontWeight: '500' }}>{site.domain}</span>
                  <button
                    onClick={() => removeDomain(site.id)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'patterns' && (
        <div>
          <h2>Custom Patterns</h2>
          <p style={{ color: '#666' }}>
            Create custom regex patterns to detect specific types of sensitive data
          </p>

          <div
            style={{
              marginBottom: '20px',
              padding: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: '#f9f9f9',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Create New Pattern</h3>
            <input
              type="text"
              value={newPattern.name}
              onChange={e =>
                setNewPattern({ ...newPattern, name: e.target.value })
              }
              placeholder="Pattern Name"
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="text"
              value={newPattern.pattern}
              onChange={e =>
                setNewPattern({ ...newPattern, pattern: e.target.value })
              }
              placeholder="Regex Pattern (e.g., \d{3}-\d{2}-\d{4})"
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="text"
              value={newPattern.pattern_type}
              onChange={e =>
                setNewPattern({ ...newPattern, pattern_type: e.target.value })
              }
              placeholder="Type (e.g., SSN, CUSTOM)"
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="text"
              value={newPattern.description}
              onChange={e =>
                setNewPattern({ ...newPattern, description: e.target.value })
              }
              placeholder="Description (optional)"
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={createPattern}
              disabled={
                loading ||
                !newPattern.name ||
                !newPattern.pattern ||
                !newPattern.pattern_type
              }
              style={{
                padding: '10px 20px',
                backgroundColor: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              Create Pattern
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {patterns.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
                No custom patterns yet
              </p>
            ) : (
              patterns.map(pattern => (
                <div
                  key={pattern.id}
                  style={{
                    padding: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                        {pattern.name}
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          color: '#666',
                          fontFamily: 'monospace',
                          marginBottom: '4px',
                        }}
                      >
                        {pattern.pattern}
                      </div>
                      <div style={{ fontSize: '12px', color: '#999' }}>
                        Type: {pattern.pattern_type}
                      </div>
                      {pattern.description && (
                        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                          {pattern.description}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deletePattern(pattern.id)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && <Dashboard />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 24px',
        border: 'none',
        backgroundColor: 'transparent',
        borderBottom: active ? '3px solid #ff9800' : '3px solid transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '15px',
        fontWeight: active ? '600' : '500',
        color: disabled ? '#ccc' : active ? '#ff9800' : '#666',
        transition: 'all 0.2s',
      }}
    >
      {children}
    </button>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  color = '#4caf50',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: string;
}) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '50px',
        height: '26px',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ display: 'none' }}
      />
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: checked ? color : '#ccc',
          borderRadius: '26px',
          transition: '0.3s',
        }}
      />
      <span
        style={{
          position: 'absolute',
          content: '',
          height: '20px',
          width: '20px',
          left: checked ? '27px' : '3px',
          bottom: '3px',
          backgroundColor: 'white',
          borderRadius: '50%',
          transition: '0.3s',
        }}
      />
    </label>
  );
}