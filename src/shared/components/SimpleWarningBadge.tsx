// src/shared/components/SimpleWarningBadge.tsx
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  isAiScanning = false,
  onEnableAutoAiScan,
  onIgnoreDetection,
  onDismissBadge,
  isDismissed = false,
  ignoredValues = [],
}: {
  detections: DetectionResult[];
  onAnonymize: (detections: DetectionResult[]) => void;
  onPopupStateChange: (isOpen: boolean) => void;
  inputText?: string;
  initialAiDetections?: AiDetection[];
  variant?: 'full' | 'dot';
  alwaysShowDot?: boolean;
  autoAiEnabled?: boolean;
  isAiScanning?: boolean;
  onEnableAutoAiScan?: () => Promise<void>;
  onIgnoreDetection?: (detection: DetectionResult | AiDetection) => void;
  onDismissBadge?: () => void;
  isDismissed?: boolean;
  ignoredValues?: string[];
}) {
  const [showPopup, setShowPopup] = useState(false);
  const [aiDetections, setAiDetections] = useState<AiDetection[] | null>(
    initialAiDetections || null
  );
  const [manualAiScanning, setManualAiScanning] = useState(false);
  const aiScanning = manualAiScanning || isAiScanning;
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'regex' | 'ai'>(
    initialAiDetections && initialAiDetections.length > 0 ? 'ai' : 'regex'
  );
  const badgeRef = useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState<{
    top?: number;
    right: number;
    bottom?: number;
    positionedAbove?: boolean;
  } | null>(null);

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

  // Calculate popup position based on badge position and available space
  const calculatePopupPosition = () => {
    if (!badgeRef.current) return null;

    const badgeRect = badgeRef.current.getBoundingClientRect();
    const popupWidth = 320; // minWidth from popup styles
    const estimatedPopupHeight = 450; // Estimated max height of popup with content
    const margin = 8; // Margin between badge and popup
    const safetyMargin = 20; // Extra margin from viewport edges

    // Calculate available space below and above the badge
    // Account for any fixed elements by using actual viewport dimensions
    const spaceBelow = window.innerHeight - badgeRect.bottom - safetyMargin;
    const spaceAbove = badgeRect.top - safetyMargin;

    // More aggressive positioning logic:
    // If there's less than the estimated height below AND more space above, position above
    // OR if badge is in the bottom 40% of the viewport, prefer above
    const badgeInBottomSection = badgeRect.bottom > window.innerHeight * 0.6;
    const shouldPositionAbove =
      (spaceBelow < estimatedPopupHeight && spaceAbove > spaceBelow) ||
      (badgeInBottomSection && spaceAbove >= 200); // Minimum 200px above

    let top: number | undefined;
    let bottom: number | undefined;

    if (shouldPositionAbove) {
      // Position above the badge
      // Calculate bottom from viewport bottom to badge top, plus margin
      bottom = window.innerHeight - badgeRect.top + margin;
      top = undefined;
    } else {
      // Position below the badge (default)
      top = badgeRect.bottom + margin;
      bottom = undefined;
    }

    // Calculate right position to align popup's right edge with badge's right edge
    const right = window.innerWidth - badgeRect.right;

    return { top, right, bottom, positionedAbove: shouldPositionAbove };
  };

  const handleTogglePopup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !showPopup;

    if (newState) {
      // Calculate position when opening
      const position = calculatePopupPosition();
      setPopupPosition(position);
    }

    setShowPopup(newState);
    onPopupStateChange(newState);

    if (!newState) {
      setAiError(null);
      setPopupPosition(null);
    }
  };

  // Update popup position on scroll/resize
  useEffect(() => {
    if (!showPopup) return;

    const updatePosition = () => {
      const position = calculatePopupPosition();
      setPopupPosition(position);
    };

    // Update position on scroll and resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showPopup]);

  const handleAiScan = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setManualAiScanning(true);
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
    } catch (error: any) {
      console.error('AI scan error:', error);
      if (error.message.includes('No API key configured')) {
        setAiError('sign_in_required');
      } else if (error.message.includes('Premium subscription required')) {
        setAiError('⭐ Upgrade to Premium to unlock AI scanning');
      } else if (error.message.includes('Rate limit exceeded')) {
        setAiError('⏱️ Daily AI scan limit reached. Try again tomorrow.');
      } else {
        setAiError(`AI scan failed: ${error.message}`);
      }
    } finally {
      setManualAiScanning(false);
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
    // Don't close popup on single anonymize - keep it open for multiple redactions
    // User can click outside or press escape to close
    // setShowPopup(false);
    // onPopupStateChange(false);
  };

  const handleAnonymizeAll = () => {
    onAnonymize(detections);
    // Close popup after "Anonymize All" since all items are redacted
    setShowPopup(false);
    onPopupStateChange(false);
  };

  const handleAnonymizeAllAi = () => {
    if (!aiDetections || aiDetections.length === 0) return;

    // Convert AI detections to DetectionResult format
    const detectionsToAnonymize: DetectionResult[] = aiDetections.map(d => ({
      type: d.type,
      value: d.value,
    }));

    onAnonymize(detectionsToAnonymize);
    // Close popup after "Anonymize All" since all items are redacted
    setShowPopup(false);
    onPopupStateChange(false);
  };

  // Filter out ignored detections by value
  const filteredDetections = detections.filter(
    d => !ignoredValues.includes(d.value)
  );
  const filteredAiDetections = aiDetections?.filter(
    d => !ignoredValues.includes(d.value)
  );

  const totalDetections = Math.max(
    filteredDetections.length,
    filteredAiDetections?.length || 0
  );
  const hasAiDetections =
    filteredAiDetections && filteredAiDetections.length > 0;
  const hasAnyDetections = filteredDetections.length > 0 || hasAiDetections;

  const handleIgnoreClick = (
    detection: DetectionResult | AiDetection,
    e?: React.MouseEvent
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onIgnoreDetection?.(detection);
  };

  const handleDismissClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowPopup(false);
    onPopupStateChange(false);
    onDismissBadge?.();
  };

  const renderPopup = () => {
    if (!popupPosition) return null;

    // Build style object based on positioning
    const popupStyle: React.CSSProperties = {
      position: 'fixed',
      right: `${popupPosition.right}px`,
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
      maxHeight: '80vh', // Limit height to 80% of viewport
      overflowY: 'auto', // Allow scrolling if content is too tall
    };

    // Add either top or bottom positioning
    if (popupPosition.positionedAbove && popupPosition.bottom !== undefined) {
      popupStyle.bottom = `${popupPosition.bottom}px`;
    } else if (popupPosition.top !== undefined) {
      popupStyle.top = `${popupPosition.top}px`;
    }

    const handleClosePopup = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowPopup(false);
      onPopupStateChange(false);
    };

    const closeButtonStyle: React.CSSProperties = {
      position: 'absolute',
      top: '8px',
      right: '8px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '4px',
      color: '#666',
      fontSize: '18px',
      lineHeight: 1,
      borderRadius: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
    };

    const popupContent = (
      <div
        onClick={e => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onMouseDown={e => {
          e.stopPropagation();
        }}
        style={{ ...popupStyle, position: 'fixed' as const }}
      >
        {/* Close button for popup */}
        <button
          type="button"
          onClick={handleClosePopup}
          title="Close"
          style={closeButtonStyle}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.backgroundColor = '#f0f0f0';
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.backgroundColor =
              'transparent';
          }}
        >
          ✕
        </button>

        {/* Show "No PII Detected" when there are no detections */}
        {!hasAnyDetections && !aiScanning ? (
          <div
            style={{
              textAlign: 'center',
              padding: '20px',
              paddingTop: '10px',
            }}
          >
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
            <p
              style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}
            >
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
                (e.target as HTMLButtonElement).style.backgroundColor =
                  '#7b1fa2';
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.backgroundColor =
                  '#9c27b0';
              }}
            >
              🤖 Run AI Scan
            </button>
            <p style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
              Premium feature - deeper analysis
            </p>
          </div>
        ) : (
          <div style={{ paddingTop: '10px' }}>
            <div
              style={{
                fontWeight: '600',
                fontSize: '16px',
                color: '#333',
                marginBottom: '12px',
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
                Pattern Match{' '}
                {filteredDetections.length > 0 &&
                  `(${filteredDetections.length})`}
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
                  position: 'relative',
                }}
              >
                🤖 AI Scan{' '}
                {filteredAiDetections &&
                  filteredAiDetections.length > 0 &&
                  `(${filteredAiDetections.length})`}
                {!autoAiEnabled && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#2196f3',
                      border: '1px solid white',
                    }}
                    title="Auto AI Scan is disabled"
                  />
                )}
              </button>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {activeTab === 'regex' ? (
                <>
                  {filteredDetections.length > 0 ? (
                    filteredDetections.map((d, idx) => (
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
                        <div style={{ display: 'flex', gap: '8px' }}>
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
                              flex: 1,
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
                            Anonymize
                          </button>
                          {onIgnoreDetection && (
                            <button
                              type="button"
                              onClick={e => handleIgnoreClick(d, e)}
                              title="Ignore this detection"
                              style={{
                                backgroundColor: '#e0e0e0',
                                color: '#666',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '500',
                              }}
                              onMouseEnter={e => {
                                (
                                  e.target as HTMLButtonElement
                                ).style.backgroundColor = '#bdbdbd';
                              }}
                              onMouseLeave={e => {
                                (
                                  e.target as HTMLButtonElement
                                ).style.backgroundColor = '#e0e0e0';
                              }}
                            >
                              Ignore
                            </button>
                          )}
                        </div>
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

                  {filteredDetections.length > 1 && (
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
                      Anonymize All ({filteredDetections.length})
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
                        Use AI to detect sensitive information that patterns
                        might miss
                      </p>
                      {!autoAiEnabled && (
                        <div
                          style={{
                            backgroundColor: '#e3f2fd',
                            border: '1px solid #2196f3',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            marginBottom: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <span
                            style={{
                              backgroundColor: '#2196f3',
                              color: 'white',
                              borderRadius: '50%',
                              width: '18px',
                              height: '18px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              flexShrink: 0,
                            }}
                          >
                            i
                          </span>
                          <span
                            style={{
                              fontSize: '12px',
                              color: '#1565c0',
                              textAlign: 'left',
                            }}
                          >
                            Auto AI Scan is disabled. Enable it for automatic
                            scanning or run a one-time scan.
                          </span>
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexDirection: 'column',
                        }}
                      >
                        {!autoAiEnabled && onEnableAutoAiScan && (
                          <button
                            type="button"
                            onClick={async e => {
                              e.preventDefault();
                              e.stopPropagation();
                              await onEnableAutoAiScan();
                              handleAiScan(e);
                            }}
                            style={{
                              backgroundColor: '#2196f3',
                              color: 'white',
                              border: 'none',
                              padding: '10px 20px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: '600',
                            }}
                            onMouseEnter={e => {
                              (
                                e.target as HTMLButtonElement
                              ).style.backgroundColor = '#1976d2';
                            }}
                            onMouseLeave={e => {
                              (
                                e.target as HTMLButtonElement
                              ).style.backgroundColor = '#2196f3';
                            }}
                          >
                            Enable AI Scan
                          </button>
                        )}
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
                          Run AI Scan
                        </button>
                      </div>
                      <p
                        style={{
                          fontSize: '11px',
                          color: '#999',
                          marginTop: '8px',
                        }}
                      >
                        {autoAiEnabled
                          ? 'Premium feature - deeper analysis'
                          : 'Run once or enable for automatic scanning'}
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
                    aiError === 'sign_in_required' ? (
                      <div
                        style={{
                          padding: '15px',
                          backgroundColor: '#e3f2fd',
                          borderRadius: '4px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔒</div>
                        <div style={{ fontWeight: '600', color: '#1565c0', marginBottom: '6px' }}>
                          Sign in to use AI Scan
                        </div>
                        <p style={{ color: '#666', fontSize: '13px', marginBottom: '12px' }}>
                          AI-powered PII detection requires a PasteProof account.
                        </p>
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open('https://pasteproof.com/auth/extension', '_blank');
                          }}
                          style={{
                            backgroundColor: '#1976d2',
                            color: 'white',
                            border: 'none',
                            padding: '8px 20px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600',
                          }}
                          onMouseEnter={e => {
                            (e.target as HTMLButtonElement).style.backgroundColor = '#1565c0';
                          }}
                          onMouseLeave={e => {
                            (e.target as HTMLButtonElement).style.backgroundColor = '#1976d2';
                          }}
                        >
                          Sign In
                        </button>
                      </div>
                    ) : (
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
                    )
                  )}

                  {filteredAiDetections && filteredAiDetections.length > 0 && (
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
                        ✨ AI detected {filteredAiDetections.length} potential
                        issue
                        {filteredAiDetections.length !== 1 ? 's' : ''}
                      </div>
                      {filteredAiDetections.map((d, idx) => (
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
                          <div style={{ display: 'flex', gap: '8px' }}>
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
                                flex: 1,
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
                              Anonymize
                            </button>
                            {onIgnoreDetection && (
                              <button
                                type="button"
                                onClick={e => handleIgnoreClick(d, e)}
                                title="Ignore this detection"
                                style={{
                                  backgroundColor: '#e0e0e0',
                                  color: '#666',
                                  border: 'none',
                                  padding: '6px 12px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: '500',
                                }}
                                onMouseEnter={e => {
                                  (
                                    e.target as HTMLButtonElement
                                  ).style.backgroundColor = '#bdbdbd';
                                }}
                                onMouseLeave={e => {
                                  (
                                    e.target as HTMLButtonElement
                                  ).style.backgroundColor = '#e0e0e0';
                                }}
                              >
                                Ignore
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {filteredAiDetections.length > 1 && (
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAnonymizeAllAi();
                          }}
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
                            (
                              e.target as HTMLButtonElement
                            ).style.backgroundColor = '#c62828';
                          }}
                          onMouseLeave={e => {
                            (
                              e.target as HTMLButtonElement
                            ).style.backgroundColor = '#d32f2f';
                          }}
                        >
                          Redact All ({filteredAiDetections.length})
                        </button>
                      )}
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

            {/* Dismiss warnings link */}
            {onDismissBadge && (
              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={handleDismissClick}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#666',
                    fontSize: '12px',
                    textDecoration: 'underline',
                    padding: '4px 8px',
                  }}
                  onMouseEnter={e => {
                    (e.target as HTMLButtonElement).style.color = '#333';
                  }}
                  onMouseLeave={e => {
                    (e.target as HTMLButtonElement).style.color = '#666';
                  }}
                >
                  Dismiss warnings for this field
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );

    // Render popup in a portal at document body level to avoid overflow clipping
    return createPortal(popupContent, document.body);
  };

  // Show dismissed indicator (small purple pulsing dot) when user has dismissed the badge
  // Also show dot when alwaysShowDot is true, or when variant is 'dot'
  if (
    isDismissed ||
    variant === 'dot' ||
    (alwaysShowDot && !hasAnyDetections)
  ) {
    // When dismissed with detections, always show purple pulsing dot
    // When not dismissed, use original logic
    const showDismissedState =
      isDismissed &&
      (detections.length > 0 || (aiDetections && aiDetections.length > 0));
    const dotColor = showDismissedState
      ? '#9c27b0'
      : hasAnyDetections
        ? '#9c27b0'
        : '#94a3b8';
    const shouldPulse = showDismissedState || hasAnyDetections;
    const dotTitle = showDismissedState
      ? 'Warnings dismissed - Click to view'
      : hasAnyDetections
        ? 'PII detected - Click to view'
        : 'No PII detected - Click to scan';

    return (
      <div style={{ position: 'relative', zIndex: 10000 }}>
        <div
          ref={badgeRef}
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
            boxShadow: shouldPulse
              ? '0 2px 4px rgba(156, 39, 176, 0.4)'
              : '0 2px 4px rgba(148, 163, 184, 0.4)',
            position: 'relative',
            animation: shouldPulse ? 'pulse 2s infinite' : 'none',
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
        ref={badgeRef}
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
