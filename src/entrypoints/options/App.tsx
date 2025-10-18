import { useState, useEffect } from 'react';
import { initializeApiClient, getApiClient, WhitelistSite } from '@/shared/api-client';
import { CustomPattern } from '@/shared/pii-detector';
import Dashboard from './Dashboard';
import Logo from '../../assets/icons/pasteproof-48.png'

export default function OptionsApp() {
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [patterns, setPatterns] = useState<CustomPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [whitelist, setWhitelist] = useState<WhitelistSite[]>([]);
  const [newDomain, setNewDomain] = useState('');

  // Get initial tab from URL hash
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'dashboard') return 'dashboard';
    if (hash === 'patterns') return 'patterns';
    if (hash === 'whitelist') return 'whitelist';
    return 'settings';
  };

  const [activeTab, setActiveTab] = useState<"settings" | "whitelist" | "patterns" | "dashboard">(getInitialTab());

  // Form for new pattern
  const [newPattern, setNewPattern] = useState({
    name: '',
    pattern: '',
    pattern_type: '',
    description: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  // Update URL hash when tab changes
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  // Listen for hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'dashboard' || hash === 'patterns' || hash === 'settings') {
        setActiveTab(hash as any);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

const loadWhitelist = async (key: string) => {
  try {
    const client = initializeApiClient(key);
    const sites = await client.getWhitelist();
    setWhitelist(sites);
  } catch (err) {
    console.error('Failed to load whitelist:', err);
  }
};

// Add to loadSettings
const loadSettings = async () => {
  const result = await browser.storage.local.get('apiKey');
  const key = result.apiKey as string | undefined;

  if (key) {
    setApiKey(key);
    setSavedApiKey(key);
    await Promise.all([
      loadPatterns(key),
      loadWhitelist(key)
    ]);
  }
};

// Add domain to whitelist
const addDomain = async () => {
  try {
    setLoading(true);
    setError('');

    const client = getApiClient();
    if (!client) {
      setError('Please save your API key first');
      return;
    }

    await client.addToWhitelist(newDomain);
    setSuccess('✅ Domain added to whitelist!');
    setNewDomain('');
    await loadWhitelist(savedApiKey);
    setTimeout(() => setSuccess(''), 3000);
  } catch (err) {
    setError(`Failed to add domain: ${err}`);
  } finally {
    setLoading(false);
  }
};

// Remove domain from whitelist
const removeDomain = async (whitelistId: string) => {
  if (!confirm('Remove this domain from whitelist?')) return;

  try {
    setLoading(true);
    const client = getApiClient();
    if (!client) return;

    await client.removeFromWhitelist(whitelistId);
    await loadWhitelist(savedApiKey);
    setSuccess('✅ Domain removed!');
    setTimeout(() => setSuccess(''), 3000);
  } catch (err) {
    setError(`Failed to remove domain: ${err}`);
  } finally {
    setLoading(false);
  }
};

  const loadPatterns = async (key: string) => {
    try {
      setLoading(true);
      const client = initializeApiClient(key);
      const fetchedPatterns = await client.getPatterns();
      setPatterns(fetchedPatterns);
    } catch (err) {
      setError(`Failed to load patterns: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const saveApiKey = async () => {
    try {
      setLoading(true);
      setError('');

      const client = initializeApiClient(apiKey);
      await client.getUserInfo();

      await browser.storage.local.set({ apiKey });
      setSavedApiKey(apiKey);
      setSuccess('✅ API key saved successfully!');

      await loadPatterns(apiKey);

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(`Invalid API key: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const createPattern = async () => {
    try {
      setLoading(true);
      setError('');

      const client = getApiClient();
      if (!client) {
        setError('Please save your API key first');
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

      await loadPatterns(savedApiKey);

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
      await loadPatterns(savedApiKey);
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <img src={Logo} alt='PasteProof Logo'></img>
        <div>
          <h1 style={{ margin: 0 }}>Paste Proof</h1>
          <p style={{ margin: '4px 0 0 0', color: '#666' }}>Your pasteboard bodyguard</p>
        </div>
      </div>

      {/* Navigation Tabs */}
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
          disabled={!savedApiKey}
        >
          ✓ Whitelisted Sites
        </TabButton>
        <TabButton
          active={activeTab === 'patterns'}
          onClick={() => setActiveTab('patterns')}
          disabled={!savedApiKey}
        >
          🔍 Custom Patterns
        </TabButton>
        <TabButton
          active={activeTab === 'dashboard'}
          onClick={() => setActiveTab('dashboard')}
          disabled={!savedApiKey}
        >
          📊 Dashboard
        </TabButton>
      </div>

      {/* Tab Content */}
      {activeTab === 'settings' && (
        <div
          style={{
            marginBottom: '40px',
            padding: '20px',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}
        >
          <h2>API Key</h2>
          <p style={{ color: '#666' }}>
            Enter your API key to enable Premium features (custom patterns, AI
            detection, audit logs)
          </p>

          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="pk_test_..."
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '14px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              marginBottom: '10px',
              boxSizing: 'border-box',
            }}
          />

          <button
            onClick={saveApiKey}
            disabled={loading || !apiKey}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            {loading ? 'Saving...' : 'Save API Key'}
          </button>

          {savedApiKey && (
            <p style={{ marginTop: '10px', color: '#4caf50', fontSize: '14px' }}>
              ✅ API key configured
            </p>
          )}
        </div>
      )}

      {activeTab === 'patterns' && savedApiKey && (
        <>
          <div
            style={{
              marginBottom: '40px',
              padding: '20px',
              border: '1px solid #ddd',
              borderRadius: '8px',
            }}
          >
            <h2>Create Custom Pattern</h2>

            <input
              type="text"
              placeholder="Pattern name (e.g., Employee ID)"
              value={newPattern.name}
              onChange={e =>
                setNewPattern({ ...newPattern, name: e.target.value })
              }
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '10px',
                boxSizing: 'border-box',
              }}
            />

            <input
              type="text"
              placeholder="Regex pattern (e.g., EMP-\d{6})"
              value={newPattern.pattern}
              onChange={e =>
                setNewPattern({ ...newPattern, pattern: e.target.value })
              }
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                fontFamily: 'monospace',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '10px',
                boxSizing: 'border-box',
              }}
            />

            <input
              type="text"
              placeholder="Type (e.g., EMPLOYEE_ID)"
              value={newPattern.pattern_type}
              onChange={e =>
                setNewPattern({
                  ...newPattern,
                  pattern_type: e.target.value.toUpperCase(),
                })
              }
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '10px',
                boxSizing: 'border-box',
              }}
            />

            <textarea
              placeholder="Description (optional)"
              value={newPattern.description}
              onChange={e =>
                setNewPattern({ ...newPattern, description: e.target.value })
              }
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '10px',
                minHeight: '60px',
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
                backgroundColor: '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              {loading ? 'Creating...' : 'Create Pattern'}
            </button>
          </div>

          <div style={{ marginBottom: '40px' }}>
            <h2>Your Custom Patterns ({patterns.length})</h2>

            {patterns.length === 0 ? (
              <p style={{ color: '#666' }}>
                No custom patterns yet. Create one above!
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {patterns.map(pattern => (
                  <div
                    key={pattern.id}
                    style={{
                      padding: '15px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      backgroundColor: '#f9f9f9',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 5px 0' }}>{pattern.name}</h3>
                        <code
                          style={{
                            backgroundColor: '#fff',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '13px',
                          }}
                        >
                          {pattern.pattern}
                        </code>
                        <p
                          style={{
                            margin: '8px 0 0 0',
                            color: '#666',
                            fontSize: '14px',
                          }}
                        >
                          Type: <strong>{pattern.pattern_type}</strong>
                        </p>
                        {pattern.description && (
                          <p
                            style={{
                              margin: '5px 0 0 0',
                              color: '#666',
                              fontSize: '13px',
                            }}
                          >
                            {pattern.description}
                          </p>
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
                          fontSize: '12px',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'dashboard' && savedApiKey && <Dashboard />}

      {activeTab === 'dashboard' && !savedApiKey && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔐</div>
          <p style={{ color: '#666', marginBottom: '16px' }}>
            Please configure your API key in Settings to view the dashboard
          </p>
          <button
            onClick={() => setActiveTab('settings')}
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
            Go to Settings
          </button>
        </div>
      )}

      {activeTab === 'whitelist' && savedApiKey && (
        <>
          <div
            style={{
              marginBottom: '40px',
              padding: '20px',
              border: '1px solid #ddd',
              borderRadius: '8px',
            }}
          >
            <h2>Add Site to Whitelist</h2>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
              Paste Proof will not scan for PII on whitelisted sites. Use this for trusted internal tools.
            </p>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="example.com"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
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
                  cursor: loading || !newDomain ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <h2>Whitelisted Sites ({whitelist.length})</h2>

            {whitelist.length === 0 ? (
              <p style={{ color: '#666' }}>
                No whitelisted sites yet. Add trusted domains above.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {whitelist.map(site => (
                  <div
                    key={site.id}
                    style={{
                      padding: '15px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      backgroundColor: '#f9f9f9',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '15px' }}>
                        {site.domain}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        Added {new Date(site.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => removeDomain(site.id)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div
          style={{
            padding: '15px',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '4px',
            marginTop: '20px',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '15px',
            backgroundColor: '#e8f5e9',
            color: '#2e7d32',
            borderRadius: '4px',
            marginTop: '20px',
          }}
        >
          {success}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 24px',
        border: 'none',
        background: 'none',
        borderBottom: active ? '3px solid #ff9800' : '3px solid transparent',
        color: disabled ? '#ccc' : active ? '#ff9800' : '#666',
        fontWeight: active ? '600' : '400',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '15px',
        transition: 'all 0.2s',
      }}
    >
      {children}
    </button>
  );
}