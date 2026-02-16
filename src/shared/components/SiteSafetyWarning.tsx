// src/shared/components/SiteSafetyWarning.tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SiteScanResult } from '@/shared/api-client';

export function SiteSafetyWarning({
  scanResult,
  onDismiss,
  onProceedAnyway,
}: {
  scanResult: SiteScanResult;
  onDismiss: () => void;
  onProceedAnyway: () => void;
}) {
  const [isMinimized, setIsMinimized] = useState(false);

  const isMalicious = scanResult.verdict === 'MALICIOUS';
  const isSuspicious = scanResult.verdict === 'SUSPICIOUS';

  // Color scheme based on severity
  const colors = isMalicious
    ? {
        bg: '#ffebee',
        border: '#f44336',
        text: '#c62828',
        icon: '🚨',
        title: 'Dangerous Website Detected',
      }
    : {
        bg: '#fff3e0',
        border: '#ff9800',
        text: '#e65100',
        icon: '⚠️',
        title: 'Suspicious Website Detected',
      };

  // Format flags for display
  const formatFlag = (flag: string): string => {
    return flag
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  if (isMinimized) {
    const minimizedContent = (
      <div
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 2147483647,
          backgroundColor: colors.border,
          color: 'white',
          padding: '8px 16px',
          borderRadius: '20px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '14px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'pulse-warning 2s infinite',
        }}
      >
        {colors.icon} {isMalicious ? 'Danger' : 'Warning'} - Click to expand
        <style>{`
          @keyframes pulse-warning {
            0%, 100% {
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            50% {
              box-shadow: 0 4px 20px ${isMalicious ? 'rgba(244, 67, 54, 0.5)' : 'rgba(255, 152, 0, 0.5)'};
            }
          }
        `}</style>
      </div>
    );
    return createPortal(minimizedContent, document.body);
  }

  const warningContent = (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        backgroundColor: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        padding: '20px',
        maxWidth: '480px',
        width: 'calc(100% - 32px)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        animation: 'slide-down 0.3s ease-out',
      }}
      onClick={e => e.stopPropagation()}
    >
      <style>{`
        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ fontSize: '32px', lineHeight: 1 }}>{colors.icon}</div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: '700',
              fontSize: '18px',
              color: colors.text,
              marginBottom: '4px',
            }}
          >
            {colors.title}
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            This website has been flagged as potentially {isMalicious ? 'dangerous' : 'suspicious'}.
            Be careful when entering personal information.
          </div>
        </div>
        <button
          onClick={() => setIsMinimized(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '20px',
            color: '#999',
            padding: '4px',
            lineHeight: 1,
          }}
          title="Minimize"
        >
          −
        </button>
      </div>

      {/* Risk Score */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
          Risk Score:
        </div>
        <div
          style={{
            flex: 1,
            height: '8px',
            backgroundColor: '#e0e0e0',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(scanResult.score * 5, 100)}%`,
              height: '100%',
              backgroundColor: isMalicious ? '#f44336' : '#ff9800',
              borderRadius: '4px',
              transition: 'width 0.5s ease-out',
            }}
          />
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: '700',
            color: colors.text,
            minWidth: '32px',
            textAlign: 'right',
          }}
        >
          {scanResult.score}
        </div>
      </div>

      {/* Flags */}
      {scanResult.flags && scanResult.flags.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#666',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Warning Flags
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {scanResult.flags.map((flag, idx) => (
              <span
                key={idx}
                style={{
                  backgroundColor: colors.border,
                  color: 'white',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                {formatFlag(flag)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Business Logic Details */}
      {scanResult.details?.business_logic?.reason && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e0e0e0',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#666',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Analysis
          </div>
          <div style={{ fontSize: '14px', color: '#333', lineHeight: 1.5 }}>
            {scanResult.details.business_logic.reason}
          </div>
          {scanResult.details.business_logic.official_domains &&
            scanResult.details.business_logic.official_domains.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>
                <strong>Official domain{scanResult.details.business_logic.official_domains.length > 1 ? 's' : ''}:</strong>{' '}
                {scanResult.details.business_logic.official_domains.join(', ')}
              </div>
            )}
        </div>
      )}

      {/* Domain Forensics */}
      {scanResult.details?.domain_forensics?.is_new_domain && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#fff8e1',
            borderRadius: '8px',
            border: '1px solid #ffc107',
            fontSize: '13px',
            color: '#795548',
          }}
        >
          <strong>⏰ New Domain:</strong> This domain was registered only{' '}
          {scanResult.details.domain_forensics.age_days} days ago.
          {scanResult.details.domain_forensics.registrar && (
            <span> (Registrar: {scanResult.details.domain_forensics.registrar})</span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={onDismiss}
          style={{
            flex: 1,
            padding: '12px 16px',
            backgroundColor: colors.border,
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          Leave This Site
        </button>
        <button
          onClick={onProceedAnyway}
          style={{
            padding: '12px 16px',
            backgroundColor: 'transparent',
            color: '#666',
            border: '1px solid #ccc',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          I Understand the Risk
        </button>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: '12px',
          fontSize: '11px',
          color: '#999',
          textAlign: 'center',
        }}
      >
        Protected by PasteProof • Analysis completed in {scanResult.analysis_time_ms}ms
      </div>
    </div>
  );

  return createPortal(warningContent, document.body);
}
