import {
  detectPii,
  DetectionResult,
  setCustomPatterns,
  getCustomPatterns,
  PiiType,
} from '@/shared/pii-detector';
import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { getApiClient, initializeApiClient } from '@/shared/api-client';

// Simple warning badge component without MUI dependencies
function SimpleWarningBadge({
  detections,
  onAnonymize,
  onPopupStateChange,
}: {
  detections: DetectionResult[];
  onAnonymize: (detections: DetectionResult[]) => void;
  onPopupStateChange: (isOpen: boolean) => void;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const tooltipText = `PII Detected: ${detections.map(d => d.type).join(', ')}`;

  const handleTogglePopup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !showPopup;
    setShowPopup(newState);
    onPopupStateChange(newState);
  };

  const handleAnonymizeClick = (detection: DetectionResult) => {
    onAnonymize([detection]);
    setShowPopup(false);
    onPopupStateChange(false);
  };

  const handleAnonymizeAll = () => {
    onAnonymize(detections);
    setShowPopup(false);
    onPopupStateChange(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        title={tooltipText}
        onClick={handleTogglePopup}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          backgroundColor: '#fff3cd',
          border: '2px solid #ffc107',
          borderRadius: '50%',
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            fill="#ff9800"
          />
        </svg>
      </div>

      {showPopup && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            right: '0',
            marginTop: '8px',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '12px',
            minWidth: '280px',
            maxWidth: '400px',
            zIndex: 2147483647,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '14px',
          }}
        >
          <div
            style={{
              fontWeight: '600',
              marginBottom: '12px',
              fontSize: '16px',
              color: '#333',
            }}
          >
            ⚠️ PII Detected
          </div>

          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {detections.map((d, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px',
                  marginBottom: '8px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '6px',
                  border: '1px solid #e9ecef',
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
                  onClick={() => handleAnonymizeClick(d)}
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
                    (e.target as HTMLButtonElement).style.backgroundColor =
                      '#f57c00';
                  }}
                  onMouseLeave={e => {
                    (e.target as HTMLButtonElement).style.backgroundColor =
                      '#ff9800';
                  }}
                >
                  Anonymize This
                </button>
              </div>
            ))}
          </div>

          {detections.length > 1 && (
            <button
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
        </div>
      )}
    </div>
  );
}

export default defineContentScript({
  matches: ['<all_urls>'],

  async main(ctx) {
    await initializeCustomPatterns();
    console.log('=== DEBUG: Custom Patterns ===');
    console.log('Custom patterns:', getCustomPatterns());
    console.log('Testing detection with custom patterns...');

    const testText = 'EMP-123456 and my card is 4242 4242 4242 4242';
    const testResults = detectPii(testText);
    console.log('Detection results:', testResults);

    let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;
    let badgeContainer: HTMLDivElement | null = null;
    let badgeRoot: Root | null = null;
    let isPopupOpen = false; // Track popup state

    const isValidInput = (
      element: Element
    ): element is HTMLInputElement | HTMLTextAreaElement => {
      if (element.tagName === 'TEXTAREA') return true;
      if (element.tagName === 'INPUT') {
        const input = element as HTMLInputElement;
        const textTypes = [
          'text',
          'email',
          'tel',
          'url',
          'search',
          'password',
          'number',
        ];
        return textTypes.includes(input.type.toLowerCase());
      }
      if (element.getAttribute('contenteditable') === 'true') {
        return true;
      }
      return false;
    };

    const anonymizeValue = (detection: DetectionResult): string => {
      switch (detection.type) {
        case 'CREDIT_CARD':
          // Show last 4 digits
          const cleaned = detection.value.replace(/\s/g, '');
          const last4 = cleaned.slice(-4);
          const masked = '•'.repeat(cleaned.length - 4);
          // Preserve original spacing format
          if (detection.value.includes(' ')) {
            return (
              masked.match(/.{1,4}/g)?.join(' ') + ' ' + last4 ||
              detection.value
            );
          }
          return masked + last4;

        case 'EMAIL':
          const [user, domain] = detection.value.split('@');
          if (!user || !domain) return '[REDACTED]';
          const maskedUser = user[0] + '•'.repeat(Math.max(user.length - 1, 2));
          return `${maskedUser}@${domain}`;

        case 'SSN':
          // Show last 4 digits: XXX-XX-1234
          return detection.value.replace(/\d(?=\d{4})/g, '•');

        case 'PHONE':
          // Show last 4 digits
          return detection.value.replace(/\d(?=\d{4})/g, '•');

        default:
          return '[REDACTED]';
      }
    };

    const handleAnonymize = async (detections: DetectionResult[]) => {
      if (!activeInput) return;

      let newValue = activeInput.value;
      const sortedDetections = [...detections].sort(
        (a, b) => b.value.length - a.value.length
      );

      sortedDetections.forEach(d => {
        const anonymized = anonymizeValue(d);
        newValue = newValue.replace(d.value, anonymized);
      });

      activeInput.value = newValue;
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Log anonymization events
      const apiClient = getApiClient();
      if (apiClient) {
        const domain = window.location.hostname;
        for (const detection of detections) {
          await apiClient.logEvent({
            event_type: 'anonymization',
            domain,
            pii_type: detection.type,
            was_anonymized: true,
          });
        }
      }

      const results = detectPii(newValue);
      handleDetection(results);
    };

    const createBadgeContainer = (
      input: HTMLInputElement | HTMLTextAreaElement
    ): HTMLDivElement => {
      const container = document.createElement('div');
      container.id = `pii-badge-${Math.random().toString(36).substr(2, 9)}`;

      container.style.cssText = `
        position: absolute !important;
        top: 8px !important;
        right: 8px !important;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: auto !important;
        height: auto !important;
        transform: translateZ(0) !important;
        will-change: transform !important;
        isolation: isolate !important;
      `;

      let targetParent = input.parentElement;
      let current = input.parentElement;

      while (current && current !== document.body) {
        const classList = current.classList;
        if (
          classList.contains('input-wrapper') ||
          classList.contains('text-input-wrapper') ||
          classList.contains('application-container')
        ) {
          targetParent = current;
          break;
        }

        const style = window.getComputedStyle(current);
        if (style.position === 'relative' || style.position === 'absolute') {
          targetParent = current;
          break;
        }
        current = current.parentElement;
      }

      if (targetParent) {
        const parentStyle = window.getComputedStyle(targetParent);
        if (parentStyle.position === 'static') {
          (targetParent as HTMLElement).style.position = 'relative';
        }

        targetParent.appendChild(container);
      } else {
        container.style.position = 'fixed !important';
        const rect = input.getBoundingClientRect();
        container.style.top = `${rect.top + 8}px !important`;
        container.style.left = `${rect.right - 40}px !important`;
        document.body.appendChild(container);
      }

      return container;
    };

    const handleDetection = async (detections: DetectionResult[]) => {
      if (detections.length > 0 && !badgeContainer) {
        const apiClient = getApiClient();
        if (apiClient) {
          const domain = window.location.hostname;
          for (const detection of detections) {
            await apiClient.logEvent({
              event_type: 'detection',
              domain,
              pii_type: detection.type,
              was_anonymized: false,
            });
          }
        }
      }

      if (detections.length > 0 && activeInput) {
        if (!badgeContainer) {
          badgeContainer = createBadgeContainer(activeInput);
          badgeContainer.offsetHeight;

          badgeRoot = ReactDOM.createRoot(badgeContainer);
          badgeRoot.render(
            <SimpleWarningBadge
              detections={detections}
              onAnonymize={handleAnonymize}
              onPopupStateChange={isOpen => {
                isPopupOpen = isOpen;
                console.log('Popup state changed:', isOpen);
              }}
            />
          );

          console.log('Badge rendered with detections:', detections);
        } else if (badgeRoot) {
          badgeRoot.render(
            <SimpleWarningBadge
              detections={detections}
              onAnonymize={handleAnonymize}
              onPopupStateChange={isOpen => {
                isPopupOpen = isOpen;
                console.log('Popup state changed:', isOpen);
              }}
            />
          );
        }
      } else {
        removeBadge();
      }
    };

    const removeBadge = () => {
      if (badgeRoot) {
        badgeRoot.unmount();
        badgeRoot = null;
      }
      if (badgeContainer) {
        badgeContainer.remove();
        badgeContainer = null;
      }
      isPopupOpen = false;
    };

    const getInputValue = (
      element: HTMLInputElement | HTMLTextAreaElement | HTMLElement
    ): string => {
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        return (element as HTMLInputElement | HTMLTextAreaElement).value;
      }
      if (element.getAttribute('contenteditable') === 'true') {
        return element.textContent || '';
      }
      return '';
    };

    const debouncedScan = debounce((text: string) => {
      const results = detectPii(text);
      handleDetection(results);
    }, 500);

    const attachInputListener = (
      input: HTMLInputElement | HTMLTextAreaElement | HTMLElement
    ) => {
      const handler = () => {
        if (activeInput === input) {
          debouncedScan(getInputValue(input));
        }
      };

      input.addEventListener('input', handler);

      if (input.getAttribute('contenteditable') === 'true') {
        input.addEventListener('keyup', handler);
      }
    };

    document.addEventListener(
      'focusin',
      event => {
        const target = event.target as HTMLElement;

        if (!isValidInput(target)) return;

        removeBadge();

        activeInput = target as HTMLInputElement | HTMLTextAreaElement;
        const currentValue = getInputValue(activeInput);
        const results = detectPii(currentValue);
        handleDetection(results);

        attachInputListener(activeInput);
      },
      true
    );

    document.addEventListener(
      'focusout',
      event => {
        const relatedTarget = event.relatedTarget as Node;

        // Don't remove if focus moved to the badge or popup is open
        if (badgeContainer?.contains(relatedTarget) || isPopupOpen) {
          console.log('Keeping badge - popup is open or focus in badge');
          return;
        }

        // Delay to handle rapid focus changes
        setTimeout(() => {
          const currentFocus = document.activeElement;

          // Don't remove if popup is still open
          if (isPopupOpen) {
            console.log('Keeping badge - popup still open after delay');
            return;
          }

          // Don't remove if focus returned to our input
          if (currentFocus !== activeInput) {
            removeBadge();
            activeInput = null;
          }
        }, 100);
      },
      true
    );

    // Close popup if user clicks outside
    document.addEventListener('mousedown', event => {
      if (
        isPopupOpen &&
        badgeContainer &&
        !badgeContainer.contains(event.target as Node)
      ) {
        // User clicked outside the popup, close it
        isPopupOpen = false;
        if (badgeRoot) {
          const currentValue = getInputValue(activeInput!);
          const results = detectPii(currentValue);
          badgeRoot.render(
            <SimpleWarningBadge
              detections={results}
              onAnonymize={handleAnonymize}
              onPopupStateChange={isOpen => {
                isPopupOpen = isOpen;
              }}
            />
          );
        }
      }
    });

    ctx.onInvalidated(() => {
      removeBadge();
    });

    // Fetch custom patterns from API
    async function initializeCustomPatterns() {
      try {
        // Get API key from storage
        const result = await browser.storage.local.get('apiKey');
        const apiKey = result.apiKey as string | undefined;

        if (!apiKey) {
          console.log('No API key found - using built-in patterns only');
          return;
        }

        // Initialize API client
        const apiClient = initializeApiClient(apiKey);

        // Fetch custom patterns
        const patterns = await apiClient.getPatterns();
        setCustomPatterns(patterns);

        console.log(`✅ Loaded ${patterns.length} custom patterns from API`);
      } catch (error) {
        console.error('Failed to load custom patterns:', error);
        // Continue with built-in patterns only
      }
    }

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.apiKey) {
        console.log('API key changed - reloading patterns');
        initializeCustomPatterns();
      }
    });

    function debounce(func: (...args: any[]) => void, delay: number) {
      let timeoutId: NodeJS.Timeout;
      return (...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
      };
    }
  },
});
