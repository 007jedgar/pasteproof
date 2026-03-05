// src/shared/components/DataPolicyWarning.tsx
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DataPolicyValidateResult,
  DataPolicyViolation,
  DataPolicyApplicablePolicy,
} from '@/shared/api-client';

// ── Severity helpers ───────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  critical: { bg: '#ffebee', text: '#c62828', border: '#f44336', label: 'Critical' },
  high:     { bg: '#fff3e0', text: '#e65100', border: '#ff9800', label: 'High' },
  medium:   { bg: '#fffde7', text: '#f57f17', border: '#fbc02d', label: 'Medium' },
  low:      { bg: '#e8f5e9', text: '#2e7d32', border: '#4caf50', label: 'Low' },
};

const SENSITIVITY_STYLE: Record<string, { bg: string; text: string }> = {
  public:       { bg: '#e8f5e9', text: '#2e7d32' },
  internal:     { bg: '#e3f2fd', text: '#1565c0' },
  confidential: { bg: '#fff3e0', text: '#e65100' },
  restricted:   { bg: '#ffebee', text: '#c62828' },
};

// ── PII type display helpers ────────────────────────────────────────────────

const PII_TYPE_LABEL: Record<string, string> = {
  SSN:              'Social Security Number',
  CREDIT_CARD:      'Credit Card',
  EMAIL_ADDRESS:    'Email Address',
  PHONE_NUMBER:     'Phone Number',
  FULL_NAME:        'Full Name',
  ADDRESS:          'Address',
  DATE_OF_BIRTH:    'Date of Birth',
  DRIVERS_LICENSE:  "Driver's License",
  PASSPORT:         'Passport',
  BANK_ACCOUNT:     'Bank Account',
  ROUTING_NUMBER:   'Routing Number',
  API_KEY:          'API Key',
  AWS_KEY:          'AWS Key',
  GITHUB_TOKEN:     'GitHub Token',
  PRIVATE_KEY:      'Private Key',
  JWT:              'JWT Token',
  PASSWORD:         'Password',
  IP_ADDRESS:       'IP Address',
  MAC_ADDRESS:      'MAC Address',
  CRYPTO_WALLET:    'Crypto Wallet',
  MEDICAL_RECORD:   'Medical Record',
  IBAN:             'IBAN',
  CVV:              'CVV',
  ZIP_CODE:         'ZIP Code',
};

const PII_REDACTED_EXAMPLE: Record<string, string> = {
  SSN:              '•••-••-••••',
  CREDIT_CARD:      '•••• •••• •••• ••••',
  EMAIL_ADDRESS:    'j•••@e•••••.com',
  PHONE_NUMBER:     '(•••) •••-••••',
  FULL_NAME:        'J••• D••',
  ADDRESS:          '••• M••• St, ••••••',
  DATE_OF_BIRTH:    '••/••/••••',
  DRIVERS_LICENSE:  '•-••••-••••-••••',
  PASSPORT:         '•••••••••',
  BANK_ACCOUNT:     '••••••••••••',
  ROUTING_NUMBER:   '•••••••••',
  API_KEY:          'sk-••••••••••••••••••••••',
  AWS_KEY:          'AKIA••••••••••••••••',
  GITHUB_TOKEN:     'ghp_••••••••••••••••••••••',
  PRIVATE_KEY:      '-----BEGIN PRIVATE KEY-----',
  JWT:              'eyJ•••••.eyJ•••••.•••••',
  PASSWORD:         '••••••••••••',
  IP_ADDRESS:       '•••.•••.•••.•••',
  MAC_ADDRESS:      '••:••:••:••:••:••',
  CRYPTO_WALLET:    '0x••••••••••••••••••••••••',
  MEDICAL_RECORD:   'MRN-••••••••',
  IBAN:             '••••-••••-••••-••••-••••',
  CVV:              '•••',
  ZIP_CODE:         '•••••',
};

// ── Sub-components ─────────────────────────────────────────────────────────

function PiiChecksDropdown({ piiChecks }: { piiChecks: string[] }) {
  const [open, setOpen] = useState(false);
  if (!piiChecks?.length) return null;

  return (
    <div style={{ marginTop: '6px' }}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: '#666',
          fontWeight: '600',
        }}
      >
        <span style={{ fontSize: '9px' }}>{open ? '▾' : '▸'}</span>
        Scans for {piiChecks.length} PII type{piiChecks.length !== 1 ? 's' : ''}
      </button>

      {open && (
        <div
          style={{
            marginTop: '6px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '5px',
          }}
        >
          {piiChecks.map((type, i) => (
            <span
              key={i}
              title={PII_TYPE_LABEL[type] ?? type.replace(/_/g, ' ')}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                backgroundColor: '#1a1a1a',
                borderRadius: '4px',
                padding: '4px 8px',
                gap: '2px',
              }}
            >
              <span
                style={{
                  fontFamily: 'monospace, monospace',
                  fontSize: '11px',
                  color: '#bdbdbd',
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap',
                }}
              >
                {PII_REDACTED_EXAMPLE[type] ?? '••••••••••'}
              </span>
              <span
                style={{
                  fontSize: '9px',
                  color: '#666',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                }}
              >
                {PII_TYPE_LABEL[type] ?? type.replace(/_/g, ' ')}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ViolationRow({ v }: { v: DataPolicyViolation }) {
  const s = SEVERITY_STYLE[v.severity] ?? SEVERITY_STYLE.low;
  return (
    <div
      style={{
        padding: '8px 10px',
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: '6px',
        marginBottom: '6px',
        fontSize: '13px',
        lineHeight: 1.4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          marginBottom: '2px',
        }}
      >
        <span
          style={{
            backgroundColor: s.border,
            color: 'white',
            padding: '1px 7px',
            borderRadius: '10px',
            fontSize: '10px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            flexShrink: 0,
          }}
        >
          {s.label}
        </span>
        <span style={{ fontWeight: '600', color: s.text }}>{v.policy_name}</span>
      </div>
      <div style={{ color: '#555' }}>{v.message}</div>
    </div>
  );
}

function PolicyCard({ p }: { p: DataPolicyApplicablePolicy }) {
  const sens = SENSITIVITY_STYLE[p.sensitivity_level] ?? SENSITIVITY_STYLE.internal;
  return (
    <div
      style={{
        padding: '10px 12px',
        backgroundColor: 'white',
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        marginBottom: '6px',
        fontSize: '13px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '5px',
        }}
      >
        <span style={{ fontWeight: '600', color: '#222', flex: 1 }}>{p.name}</span>
        <span
          style={{
            backgroundColor: sens.bg,
            color: sens.text,
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: '600',
            textTransform: 'capitalize',
            flexShrink: 0,
          }}
        >
          {p.sensitivity_level}
        </span>
      </div>

      <PiiChecksDropdown piiChecks={p.pii_checks} />

      {p.require_approval && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '12px',
            color: '#e65100',
            backgroundColor: '#fff3e0',
            padding: '4px 8px',
            borderRadius: '4px',
          }}
        >
          ⏳ Approval required — {p.approver_emails?.join(', ')}
        </div>
      )}

      {p.user_instructions && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '12px',
            color: '#444',
            backgroundColor: '#f5f5f5',
            padding: '6px 8px',
            borderRadius: '4px',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {p.user_instructions}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function DataPolicyWarning({
  result,
  fileName,
  onDismiss,
  onProceed,
}: {
  result: DataPolicyValidateResult;
  fileName: string;
  onDismiss: () => void;
  onProceed: () => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const [policiesOpen, setPoliciesOpen] = useState(false);

  const isBlocked = !result.allowed;
  const accentColor = isBlocked ? '#f44336' : '#ff9800';
  const accentBg = isBlocked ? '#ffebee' : '#fff8f0';
  const icon = isBlocked ? '🚫' : '⚠️';

  // ── Minimized pill ──────────────────────────────────────────────────────
  if (minimized) {
    return createPortal(
      <div
        onClick={() => setMinimized(false)}
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 2147483647,
          backgroundColor: accentColor,
          color: 'white',
          padding: '8px 16px',
          borderRadius: '20px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          userSelect: 'none',
        }}
      >
        {icon} Upload {isBlocked ? 'Blocked' : 'Warning'} — tap to expand
      </div>,
      document.body
    );
  }

  // ── Expanded card ───────────────────────────────────────────────────────
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        backgroundColor: accentBg,
        border: `2px solid ${accentColor}`,
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        padding: '20px',
        maxWidth: '520px',
        width: 'calc(100% - 32px)',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        animation: 'pp-dp-slide 0.3s ease-out',
      }}
      onClick={e => e.stopPropagation()}
    >
      <style>{`
        @keyframes pp-dp-slide {
          from { opacity: 0; transform: translateX(-50%) translateY(-18px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
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
        <div style={{ fontSize: '26px', lineHeight: 1, flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: '700',
              fontSize: '16px',
              color: isBlocked ? '#c62828' : '#e65100',
              marginBottom: '3px',
            }}
          >
            {isBlocked ? 'Upload Blocked by Team Policy' : 'Upload Warning'}
          </div>
          <div style={{ fontSize: '13px', color: '#555', lineHeight: 1.45 }}>
            <strong style={{ fontFamily: 'monospace, monospace' }}>{fileName}</strong>
            {isBlocked
              ? ' cannot be uploaded — a critical policy violation was found.'
              : ' triggered a team policy warning. Review details before proceeding.'}
          </div>
        </div>
        <button
          onClick={() => setMinimized(true)}
          title="Minimize"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '20px',
            color: '#aaa',
            padding: '2px 4px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          −
        </button>
      </div>

      {/* Violations */}
      {result.violations.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: '700',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              marginBottom: '8px',
            }}
          >
            Violations ({result.violations.length})
          </div>
          {result.violations.map((v, i) => (
            <ViolationRow key={i} v={v} />
          ))}
        </div>
      )}

      {/* Applicable policies (collapsible) */}
      {result.applicable_policies.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setPoliciesOpen(o => !o)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0 0 8px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '10px',
              fontWeight: '700',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
            }}
          >
            <span>{policiesOpen ? '▾' : '▸'}</span>
            Applicable Policies ({result.applicable_policies.length})
          </button>
          {policiesOpen &&
            result.applicable_policies.map((p, i) => (
              <PolicyCard key={i} p={p} />
            ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={onDismiss}
          style={{
            flex: 1,
            padding: '11px 16px',
            backgroundColor: accentColor,
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          Cancel Upload
        </button>
        {!isBlocked && (
          <button
            onClick={onProceed}
            style={{
              padding: '11px 16px',
              backgroundColor: 'transparent',
              color: '#666',
              border: '1px solid #ccc',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Proceed Anyway
          </button>
        )}
      </div>

      {/* Footer */}
      {result.message && (
        <div
          style={{
            marginTop: '12px',
            fontSize: '11px',
            color: '#aaa',
            textAlign: 'center',
          }}
        >
          {result.message} · Protected by PasteProof
        </div>
      )}
    </div>,
    document.body
  );
}

// ── Warning badge for file upload forms ────────────────────────────────────

export function DataPolicyInfoBadge({
  applicablePolicies,
  violations,
}: {
  applicablePolicies: DataPolicyApplicablePolicy[];
  violations: DataPolicyViolation[];
}) {
  const [showPopup, setShowPopup] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const isBlocked = violations.length > 0;
  const count = isBlocked ? violations.length : applicablePolicies.length;

  const accentColor = isBlocked ? '#c62828' : '#e65100';
  const borderColor = isBlocked ? '#f44336' : '#ff9800';
  const glowColor = isBlocked ? 'rgba(198, 40, 40, 0.55)' : 'rgba(230, 81, 0, 0.55)';

  const calcPos = (): { top: number; left: number } => {
    if (!badgeRef.current) return { top: 100, left: 100 };
    const rect = badgeRef.current.getBoundingClientRect();
    const popupWidth = 360;
    const spaceBelow = window.innerHeight - rect.bottom - 20;
    const spaceAbove = rect.top - 20;
    const top =
      spaceBelow < 260 && spaceAbove > spaceBelow
        ? Math.max(8, rect.top - 270)
        : rect.bottom + 8;
    const left = Math.max(8, Math.min(rect.right - popupWidth, window.innerWidth - popupWidth - 8));
    return { top, left };
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!showPopup) setPopupPos(calcPos());
    setShowPopup(p => !p);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    if (!popupPos) return;
    e.preventDefault();
    e.stopPropagation();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: popupPos.left,
      startTop: popupPos.top,
    };
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      setPopupPos({
        left: dragState.current.startLeft + dx,
        top: dragState.current.startTop + dy,
      });
    };

    const onUp = () => {
      dragState.current = null;
      setIsDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const popupContent = showPopup && popupPos ? (
    <div
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: `${popupPos.top}px`,
        left: `${popupPos.left}px`,
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        minWidth: '280px',
        maxWidth: '360px',
        maxHeight: '70vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2147483647,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        userSelect: isDragging ? 'none' : 'auto',
      }}
    >
      {/* Drag handle / header bar */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px 8px',
          borderBottom: '1px solid #f0f0f0',
          cursor: isDragging ? 'grabbing' : 'grab',
          flexShrink: 0,
          backgroundColor: '#fff8f4',
          borderRadius: '8px 8px 0 0',
        }}
      >
        <span style={{ fontWeight: '600', fontSize: '14px', color: accentColor }}>
          {isBlocked ? '🚫 Upload Blocked' : '⚠️ Upload Policy Active'}
        </span>
        <button
          type="button"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setShowPopup(false); }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: '#999',
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ padding: '12px 16px 16px', overflowY: 'auto', flex: 1 }}>
        {isBlocked ? (
          <>
            <div style={{ fontSize: '12px', color: '#c62828', marginBottom: '12px', fontWeight: '500' }}>
              This domain is blocked by {count} team polic{count === 1 ? 'y' : 'ies'}.
            </div>
            {violations.map((v, i) => (
              <ViolationRow key={i} v={v} />
            ))}
          </>
        ) : (
          <>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
              {`${count} polic${count === 1 ? 'y applies' : 'ies apply'} to uploads on this domain`}
            </div>
            {applicablePolicies.map((p, i) => (
              <PolicyCard key={i} p={p} />
            ))}
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 10000,
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
      }}
    >
      <div
        ref={badgeRef}
        title={isBlocked ? `Upload blocked by ${count} team polic${count === 1 ? 'y' : 'ies'} — click for details` : `${count} upload polic${count === 1 ? 'y' : 'ies'} active — click for details`}
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          border: `2px solid ${borderColor}`,
          borderRadius: '50%',
          cursor: 'pointer',
          boxShadow: `0 2px 4px rgba(0,0,0,0.15)`,
          position: 'relative',
          animation: 'pp-upload-pulse 2s infinite',
        }}
      >
        {/* Shield / upload warning icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5L12 1zm-1 14h2v2h-2v-2zm0-8h2v6h-2V7z"
            fill={accentColor}
          />
        </svg>

        {/* Policy count bubble */}
        {count > 0 && (
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
              lineHeight: 1,
            }}
          >
            {count}
          </div>
        )}
      </div>

      {showPopup && popupContent && createPortal(popupContent, document.body)}

      <style>{`
        @keyframes pp-upload-pulse {
          0%, 100% { box-shadow: 0 2px 4px ${glowColor}; }
          50%       { box-shadow: 0 2px 10px ${glowColor}; }
        }
      `}</style>
    </div>
  );
}
