// src/shared/components/PhishingWarning.tsx
import { useState, useRef, useEffect } from 'react';
import type { PhishingAnalysis, PhishingIndicator, PhishingSuspiciousPhrase } from '@/shared/api-client';

/** SUSPICIOUS_DOMAIN → "Suspicious Domain" */
function fmtLabel(s: string): string {
  return s
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const RISK_STYLE: Record<
  string,
  { bg: string; text: string; border: string; headerBg: string; badgeBg: string; icon: string; label: string }
> = {
  critical: { bg: '#ffebee', text: '#c62828', border: '#f44336', headerBg: '#fff5f5', badgeBg: '#f44336', icon: '🚨', label: 'Critical Risk' },
  high:     { bg: '#fff3e0', text: '#e65100', border: '#ff9800', headerBg: '#fff8f0', badgeBg: '#ff9800', icon: '⚠️', label: 'High Risk' },
  medium:   { bg: '#fffde7', text: '#f57f17', border: '#fbc02d', headerBg: '#fffef2', badgeBg: '#fbc02d', icon: '⚠️', label: 'Medium Risk' },
  low:      { bg: '#e8f5e9', text: '#2e7d32', border: '#4caf50', headerBg: '#f1fbf2', badgeBg: '#4caf50', icon: '✅', label: 'Low Risk' },
};

export function PhishingWarning({
  analysis,
  onDismiss,
}: {
  analysis: PhishingAnalysis;
  onDismiss: () => void;
}) {
  const style = RISK_STYLE[analysis.riskLevel] ?? RISK_STYLE.medium;
  const isDangerous = analysis.riskLevel === 'high' || analysis.riskLevel === 'critical';

  const [showPopup, setShowPopup] = useState(isDangerous);
  const badgeRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const indicators = analysis.indicators ?? [];
  const behavioralFlags = analysis.behavioralFlags ?? [];

  const calcPopupStyle = (): React.CSSProperties => {
    if (!badgeRef.current) return {};
    const rect = badgeRef.current.getBoundingClientRect();
    const popupHeight = 480;
    const popupWidth = 360;
    const margin = 8;
    const spaceAbove = rect.top;
    const right = window.innerWidth - rect.right;

    if (spaceAbove >= popupHeight + margin) {
      return {
        position: 'fixed',
        bottom: window.innerHeight - rect.top + margin,
        right,
        width: `${popupWidth}px`,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: `${popupHeight}px`,
      };
    }
    return {
      position: 'fixed',
      top: rect.bottom + margin,
      right,
      width: `${popupWidth}px`,
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: `${Math.min(popupHeight, window.innerHeight - rect.bottom - margin - 8)}px`,
    };
  };

  const togglePopup = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showPopup) {
      setPopupStyle(calcPopupStyle());
    }
    setShowPopup(p => !p);
  };

  useEffect(() => {
    if (!showPopup) return;
    const update = () => setPopupStyle(calcPopupStyle());
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    update();
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showPopup]);

  const title =
    analysis.riskLevel === 'critical'
      ? 'Scam or Phishing Attempt Detected'
      : analysis.riskLevel === 'high'
        ? 'Suspicious Message Detected'
        : analysis.riskLevel === 'medium'
          ? 'Potentially Suspicious Content'
          : 'Message Scan Complete — No Threats Found';

  return (
    <>
      {/* Badge */}
      <div
        ref={badgeRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 2147483647,
          display: 'flex',
          alignItems: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.22))',
          userSelect: 'none',
        }}
      >
        <button
          type="button"
          onClick={togglePopup}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            backgroundColor: style.badgeBg,
            color: 'white',
            border: 'none',
            borderRadius: '20px 0 0 20px',
            padding: '8px 12px 8px 14px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '15px', lineHeight: 1 }}>{style.icon}</span>
          Scam Scan: {style.label}
          <span style={{ fontSize: '11px', opacity: 0.85, marginLeft: '2px' }}>
            {showPopup ? '▲' : '▼'}
          </span>
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDismiss(); }}
          title="Dismiss"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: style.badgeBg,
            color: 'white',
            border: 'none',
            borderLeft: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '0 20px 20px 0',
            padding: '8px 11px',
            cursor: 'pointer',
            fontSize: '13px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Popup */}
      {showPopup && (
        <div
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{
            ...popupStyle,
            zIndex: 2147483646,
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '13px',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px 8px',
              borderBottom: `1px solid ${isDangerous ? style.border + '44' : '#f0f0f0'}`,
              flexShrink: 0,
              backgroundColor: style.headerBg,
              borderRadius: '10px 10px 0 0',
            }}
          >
            <span
              style={{
                fontWeight: '700',
                fontSize: '13px',
                color: style.text,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {style.icon} {title}
            </span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setShowPopup(false); }}
              title="Close"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '14px', color: '#aaa', lineHeight: 1,
                padding: '2px 5px', borderRadius: '4px',
              }}
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div style={{ padding: '12px 14px', overflowY: 'auto', flex: 1 }}>

            {/* Risk score bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '12px',
                padding: '8px 10px',
                backgroundColor: style.bg,
                borderRadius: '6px',
                border: `1px solid ${style.border}44`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ height: '6px', backgroundColor: '#e0e0e0', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(analysis.riskScore ?? 0, 100)}%`,
                      height: '100%',
                      backgroundColor: style.border,
                      borderRadius: '3px',
                    }}
                  />
                </div>
              </div>
              <span style={{ fontWeight: '700', fontSize: '13px', color: style.text, whiteSpace: 'nowrap' }}>
                {analysis.riskScore ?? 0}/100
              </span>
              <span
                style={{
                  backgroundColor: style.border,
                  color: 'white',
                  padding: '1px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}
              >
                {style.label}
              </span>
            </div>

            {/* AI recommendation */}
            {analysis.aiAnalysis?.recommendation && (
              <div style={{ marginBottom: '12px' }}>
                <div style={sectionLabel}>AI Assessment</div>
                <div style={{ fontSize: '13px', color: '#333', lineHeight: 1.5 }}>
                  {analysis.aiAnalysis.recommendation}
                </div>
              </div>
            )}

            {/* Intent / tone / urgency chips */}
            {(analysis.aiAnalysis?.intent || analysis.aiAnalysis?.overallTone || analysis.aiAnalysis?.urgency) && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {analysis.aiAnalysis?.intent && (
                  <span style={metaChip}>Intent: <strong>{analysis.aiAnalysis.intent}</strong></span>
                )}
                {analysis.aiAnalysis?.overallTone && (
                  <span style={metaChip}>Tone: <strong>{analysis.aiAnalysis.overallTone}</strong></span>
                )}
                {analysis.aiAnalysis?.urgency && (
                  <span style={metaChip}>Urgency: <strong>{analysis.aiAnalysis.urgency}</strong></span>
                )}
              </div>
            )}

            {/* Indicators */}
            {indicators.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={sectionLabel}>Warning Indicators</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {indicators.map((ind: PhishingIndicator, i) => (
                    <span
                      key={i}
                      title={ind.description}
                      style={{
                        backgroundColor: isDangerous ? '#fff0f0' : '#fff8e1',
                        color: style.text,
                        border: `1px solid ${style.border}66`,
                        padding: '3px 9px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: '500',
                        cursor: 'default',
                      }}
                    >
                      {fmtLabel(ind.type)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Suspicious phrases */}
            {(analysis.aiAnalysis?.suspiciousPhrases?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={sectionLabel}>Suspicious Phrases</div>
                {analysis.aiAnalysis!.suspiciousPhrases.map((item: PhishingSuspiciousPhrase, i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: '#fafafa',
                      border: '1px solid #e8e8e8',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      marginBottom: '6px',
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#222', lineHeight: 1.4, wordBreak: 'break-word', marginBottom: item.reason ? '4px' : 0 }}>
                      "{item.phrase}"
                    </div>
                    {item.reason && (
                      <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                        {item.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Behavioral flags */}
            {behavioralFlags.length > 0 && (
              <div style={{ marginBottom: '4px' }}>
                <div style={sectionLabel}>Behavioral Flags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {behavioralFlags.map((flag, i) => (
                    <span
                      key={i}
                      style={{
                        backgroundColor: '#f3e5f5',
                        color: '#6a1b9a',
                        border: '1px solid #ce93d866',
                        padding: '3px 9px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: '500',
                      }}
                    >
                      {typeof flag === 'string' ? fmtLabel(flag) : JSON.stringify(flag)}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
          {/* end scrollable body */}

          {/* Footer */}
          <div
            style={{
              padding: '8px 14px',
              borderTop: '1px solid #f0f0f0',
              fontSize: '10px',
              color: '#bbb',
              textAlign: 'center',
              flexShrink: 0,
            }}
          >
            Protected by PasteProof · {analysis.confidence ?? 0}% confidence
          </div>

        </div>
      )}
    </>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: '700',
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: '6px',
};

const metaChip: React.CSSProperties = {
  fontSize: '11px',
  color: '#555',
  backgroundColor: '#f5f5f5',
  border: '1px solid #e0e0e0',
  padding: '3px 8px',
  borderRadius: '10px',
};
