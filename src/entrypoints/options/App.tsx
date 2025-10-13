import { useState, useEffect } from 'react';
import { initializeApiClient, getApiClient } from '@/shared/api-client';
import { CustomPattern } from '@/shared/pii-detector';


export default function OptionsApp() {
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [patterns, setPatterns] = useState<CustomPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  const loadSettings = async () => {
    const result = await browser.storage.local.get('apiKey');
    const key = result.apiKey as string | undefined;

    if (key) {
      setApiKey(key);
      setSavedApiKey(key);
      await loadPatterns(key);
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

      // Validate API key by fetching user info
      const client = initializeApiClient(apiKey);
      await client.getUserInfo();

      // Save to storage
      await browser.storage.local.set({ apiKey });
      setSavedApiKey(apiKey);
      setSuccess('✅ API key saved successfully!');

      // Load patterns
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

      // Validate regex
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

      // Reload patterns
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
        maxWidth: '800px',
        margin: '0 auto',
        fontFamily: 'system-ui',
      }}
    >
      <h1>🛡️ Paste Proof Settings</h1>

      {/* API Key Section */}
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
            width: '90%',
            padding: '10px',
            fontSize: '14px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            marginBottom: '10px',
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

      {/* Custom Patterns Section */}
      {savedApiKey && (
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
                width: '90%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '10px',
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
                width: '90%',
                padding: '10px',
                fontSize: '14px',
                fontFamily: 'monospace',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '10px',
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
                width: '90%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '10px',
              }}
            />

            <textarea
              placeholder="Description (optional)"
              value={newPattern.description}
              onChange={e =>
                setNewPattern({ ...newPattern, description: e.target.value })
              }
              style={{
                width: '90%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '10px',
                minHeight: '60px',
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
