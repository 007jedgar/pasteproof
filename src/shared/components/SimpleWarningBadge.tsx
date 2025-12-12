// src/shared/components/SimpleWarningBadge.tsx
import { useState, useEffect } from 'react';
import { DetectionResult } from '@/shared/pii-detector';
import { getApiClient, AiDetection } from '@/shared/api-client';

export function SimpleWarningBadge({
  detections,
  onAnonymize,
  onPopupStateChange,
  inputText,
  initialAiDetections,
  variant = 'full',
  alwaysShowDot = false,
  autoAiEnabled = false,
}: {
  detections: DetectionResult[];
  onAnonymize: (detections: DetectionResult[]) => void;
  onPopupStateChange: (isOpen: boolean) => void;
  inputText?: string;
  initialAiDetections?: AiDetection[];
  variant?: 'full' | 'dot';
  alwaysShowDot?: boolean;
  autoAiEnabled?: boolean;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const [aiDetections, setAiDetections] = useState<AiDetection[] | null>(
    initialAiDetections || null
  );
  const [aiScanning, setAiScanning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'regex' | 'ai'>(
    initialAiDetections && initialAiDetections.length > 0 ? 'ai' : 'regex'
  );
  const [_, setSuccess] = useState<string>('');

  // Update AI detections when prop changes
  useEffect(() => {
    if (initialAiDetections) {
      setAiDetections(initialAiDetections);
      if (initialAiDetections.length > 0) {
        setActiveTab('ai');
      }
    }
  }, [initialAiDetections]);

  const tooltipText = `PII Detected: ${detections.map(d => d.type).join(', ')}`;

  const handleTogglePopup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !showPopup;
    setShowPopup(newState);
    onPopupStateChange(newState);

    if (!newState) {
      setAiError(null);
    }
  };

  const handleAiScan = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setAiScanning(true);
    setAiError(null);
    setActiveTab('ai');

    try {
      const apiClient = getApiClient();
      if (!apiClient) {
        throw new Error('No API key configured');
      }

      const result = await apiClient.analyzeContext(
        inputText || '',
        window.location.hostname,
        'freeform' // Default to freeform for manual scans without input context
      );

      setAiDetections(result?.detections || []);

      if (result && result.detections && result.detections.length > 0) {
        setSuccess(
          `Found ${result.detections.length} potential issue${result.detections.length !== 1 ? 's' : ''}`
        );
      } else {
        setSuccess('No sensitive information detected by AI');
      }
    } catch (error: any) {
      console.error('AI scan error:', error);
      if (error.message.includes('Premium subscription required')) {
        setAiError('⭐ Upgrade to Premium to unlock AI scanning');
      } else if (error.message.includes('Rate limit exceeded')) {
        setAiError('⏱️ Daily AI scan limit reached. Try again tomorrow.');
      } else {
        setAiError(`AI scan failed: ${error.message}`);
      }
    } finally {
      setAiScanning(false);
    }
  };

  const handleAnonymizeClick = (
    detection: DetectionResult | AiDetection,
    e?: React.MouseEvent
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const detectionToAnonymize: DetectionResult =
      'confidence' in detection
        ? { type: detection.type, value: detection.value }
        : detection;

    onAnonymize([detectionToAnonymize]);
    setShowPopup(false);
    onPopupStateChange(false);
  };

  const handleAnonymizeAll = () => {
    onAnonymize(detections);
    setShowPopup(false);
    onPopupStateChange(false);
  };

  const totalDetections = Math.max(
    detections.length,
    aiDetections?.length || 0
  );
  const hasAiDetections = aiDetections && aiDetections.length > 0;
  const hasAnyDetections = detections.length > 0 || hasAiDetections;

  const renderPopup = () => (
    <div
      onClick={e => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseDown={e => {
        e.stopPropagation();
      }}
      style={{
        position: 'absolute',
        top: '100%',
        right: '0',
        marginTop: '8px',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '16px',
        minWidth: '320px',
        maxWidth: '450px',
        zIndex: 2147483647,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
      }}
    >
      {/* Show "No PII Detected" when there are no detections */}
      {!hasAnyDetections && !aiScanning ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
          <div
            style={{
              fontWeight: '600',
              fontSize: '16px',
              color: '#333',
              marginBottom: '8px',
            }}
          >
            No PII Detected
          </div>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
            No sensitive information or pattern matches found in this field.
          </p>
          <button
            type="button"
            onClick={handleAiScan}
            style={{
              backgroundColor: '#9c27b0',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              width: '100%',
            }}
            onMouseEnter={e => {
              (e.target as HTMLButtonElement).style.backgroundColor = '#7b1fa2';
            }}
            onMouseLeave={e => {
              (e.target as HTMLButtonElement).style.backgroundColor = '#9c27b0';
            }}
          >
            🤖 Run AI Scan
          </button>
          <p style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
            Premium feature - deeper analysis
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              fontWeight: '600',
              marginBottom: '12px',
              fontSize: '16px',
              color: '#333',
            }}
          >
            ⚠️ PII Detected{' '}
            {totalDetections > 0 && `(${totalDetections} items)`}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '12px',
              borderBottom: '1px solid #e0e0e0',
            }}
          >
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('regex');
              }}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                background: 'none',
                borderBottom:
                  activeTab === 'regex'
                    ? '2px solid #ff9800'
                    : '2px solid transparent',
                color: activeTab === 'regex' ? '#ff9800' : '#666',
                fontWeight: activeTab === 'regex' ? '600' : '400',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Pattern Match {detections.length > 0 && `(${detections.length})`}
            </button>
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('ai');
              }}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                background: 'none',
                borderBottom:
                  activeTab === 'ai'
                    ? '2px solid #9c27b0'
                    : '2px solid transparent',
                color: activeTab === 'ai' ? '#9c27b0' : '#666',
                fontWeight: activeTab === 'ai' ? '600' : '400',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              🤖 AI Scan{' '}
              {aiDetections &&
                aiDetections.length > 0 &&
                `(${aiDetections.length})`}
            </button>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {activeTab === 'regex' ? (
              <>
                {detections.length > 0 ? (
                  detections.map((d, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px',
                        marginBottom: '8px',
                        backgroundColor: '#fff3cd',
                        borderRadius: '6px',
                        border: '1px solid #ffc107',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: '600',
                          color: '#ff9800',
                          marginBottom: '6px',
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {d.type.replace(/_/g, ' ')}
                      </div>
                      <div
                        style={{
                          marginBottom: '8px',
                          color: '#666',
                          wordBreak: 'break-all',
                          fontFamily: 'monospace',
                          fontSize: '13px',
                          padding: '6px',
                          backgroundColor: 'white',
                          borderRadius: '4px',
                        }}
                      >
                        {d.value}
                      </div>
                      <button
                        type="button"
                        onClick={e => handleAnonymizeClick(d, e)}
                        style={{
                          backgroundColor: '#ff9800',
                          color: 'white',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          width: '100%',
                        }}
                        onMouseEnter={e => {
                          (
                            e.target as HTMLButtonElement
                          ).style.backgroundColor = '#f57c00';
                        }}
                        onMouseLeave={e => {
                          (
                            e.target as HTMLButtonElement
                          ).style.backgroundColor = '#ff9800';
                        }}
                      >
                        Anonymize This
                      </button>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '20px',
                      color: '#666',
                    }}
                  >
                    No pattern-based detections found
                  </div>
                )}

                {detections.length > 1 && (
                  <button
                    type="button"
                    onClick={handleAnonymizeAll}
                    style={{
                      backgroundColor: '#d32f2f',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      width: '100%',
                      marginTop: '8px',
                    }}
                    onMouseEnter={e => {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        '#c62828';
                    }}
                    onMouseLeave={e => {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        '#d32f2f';
                    }}
                  >
                    Anonymize All ({detections.length})
                  </button>
                )}
              </>
            ) : (
              <>
                {!aiDetections && !aiScanning && !aiError && (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                      🤖
                    </div>
                    <p style={{ color: '#666', marginBottom: '16px' }}>
                      Use AI to detect sensitive information that patterns might
                      miss
                    </p>
                    <button
                      type="button"
                      onClick={handleAiScan}
                      style={{
                        backgroundColor: '#9c27b0',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                      }}
                      onMouseEnter={e => {
                        (e.target as HTMLButtonElement).style.backgroundColor =
                          '#7b1fa2';
                      }}
                      onMouseLeave={e => {
                        (e.target as HTMLButtonElement).style.backgroundColor =
                          '#9c27b0';
                      }}
                    >
                      Run AI Scan
                    </button>
                    <p
                      style={{
                        fontSize: '11px',
                        color: '#999',
                        marginTop: '8px',
                      }}
                    >
                      {autoAiEnabled
                        ? 'Premium feature - deeper analysis'
                        : 'Auto AI scan is off. Tap “Run AI Scan”.'}
                    </p>
                  </div>
                )}

                {aiScanning && (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                      🔄
                    </div>
                    <p style={{ color: '#666' }}>Analyzing with AI...</p>
                  </div>
                )}

                {aiError && (
                  <div
                    style={{
                      padding: '15px',
                      backgroundColor: '#ffebee',
                      color: '#c62828',
                      borderRadius: '4px',
                      textAlign: 'center',
                    }}
                  >
                    {aiError}
                  </div>
                )}

                {aiDetections && aiDetections.length > 0 && (
                  <>
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#f3e5f5',
                        borderRadius: '4px',
                        marginBottom: '12px',
                        fontSize: '12px',
                        color: '#7b1fa2',
                        fontWeight: '500',
                      }}
                    >
                      ✨ AI detected {aiDetections.length} potential issue
                      {aiDetections.length !== 1 ? 's' : ''}
                    </div>
                    {aiDetections.map((d, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px',
                          marginBottom: '8px',
                          backgroundColor: '#f3e5f5',
                          borderRadius: '6px',
                          border: '1px solid #ce93d8',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: '6px',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: '600',
                              color: '#9c27b0',
                              fontSize: '12px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {d.type.replace(/_/g, ' ')}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#666',
                              backgroundColor: 'white',
                              padding: '2px 6px',
                              borderRadius: '3px',
                            }}
                          >
                            {d.confidence}% confident
                          </div>
                        </div>
                        <div
                          style={{
                            marginBottom: '6px',
                            color: '#666',
                            wordBreak: 'break-all',
                            fontFamily: 'monospace',
                            fontSize: '13px',
                            padding: '6px',
                            backgroundColor: 'white',
                            borderRadius: '4px',
                          }}
                        >
                          {d.value}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#666',
                            fontStyle: 'italic',
                            marginBottom: '8px',
                          }}
                        >
                          {d.reason}
                        </div>
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAnonymizeClick(d);
                          }}
                          style={{
                            backgroundColor: '#9c27b0',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500',
                            width: '100%',
                          }}
                          onMouseEnter={e => {
                            (
                              e.target as HTMLButtonElement
                            ).style.backgroundColor = '#7b1fa2';
                          }}
                          onMouseLeave={e => {
                            (
                              e.target as HTMLButtonElement
                            ).style.backgroundColor = '#9c27b0';
                          }}
                        >
                          Anonymize This
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {aiDetections &&
                  aiDetections.length === 0 &&
                  !aiScanning &&
                  !aiError && (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                        ✅
                      </div>
                      <p style={{ color: '#666' }}>
                        AI scan complete - no additional PII detected
                      </p>
                    </div>
                  )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  // Always show dot when alwaysShowDot is true, or show small purple dot for AI-only detections
  if (variant === 'dot' || (alwaysShowDot && !hasAnyDetections)) {
    // Determine dot color based on detection status
    const dotColor = hasAnyDetections ? '#9c27b0' : '#94a3b8'; // Purple for detections, gray for no detections
    const dotTitle = hasAnyDetections
      ? 'PII detected - Click to view'
      : 'No PII detected - Click to scan';

    return (
      <div style={{ position: 'relative', zIndex: 10000 }}>
        <div
          title={dotTitle}
          onClick={handleTogglePopup}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '8px',
            height: '8px',
            backgroundColor: dotColor,
            borderRadius: '50%',
            cursor: 'pointer',
            boxShadow: hasAnyDetections
              ? '0 2px 4px rgba(156, 39, 176, 0.4)'
              : '0 2px 4px rgba(148, 163, 184, 0.4)',
            position: 'relative',
            animation: hasAnyDetections ? 'pulse 2s infinite' : 'none',
          }}
        />

        {showPopup && renderPopup()}

        <style>{`
          @keyframes pulse {
            0%, 100% {
              box-shadow: 0 2px 4px rgba(156, 39, 176, 0.4);
            }
            50% {
              box-shadow: 0 2px 8px rgba(156, 39, 176, 0.8);
            }
          }
        `}</style>
      </div>
    );
  }

  // Full badge variant (when there are actual detections)
  return (
    <div style={{ position: 'relative', zIndex: 10000 }}>
      <div
        title={tooltipText}
        onClick={handleTogglePopup}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          backgroundColor: 'rgba(255, 255, 255, 0.75)',
          border: hasAiDetections ? '2px solid #9c27b0' : '2px solid #ffc107',
          borderRadius: '50%',
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          position: 'relative',
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 1 }}
        >
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            fill={hasAiDetections ? '#9c27b0' : '#ff9800'}
          />
        </svg>
        {totalDetections > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '-7px',
              right: '-7px',
              backgroundColor: '#d32f2f',
              color: 'white',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '15px',
              minHeight: '15px',
              padding: '2px',
              fontSize: '9px',
              fontWeight: 'bold',
              textAlign: 'center',
              lineHeight: '1',
            }}
          >
            {totalDetections}
          </div>
        )}
      </div>

      {showPopup && renderPopup()}
    </div>
  );
}
