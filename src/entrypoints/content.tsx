import {
  detectPii,
  DetectionResult,
  setCustomPatterns,
} from '@/shared/pii-detector';
import ReactDOM from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { getApiClient, initializeApiClient } from '@/shared/api-client';
import { SimpleWarningBadge } from '@/shared/components';

export default defineContentScript({
  matches: ['<all_urls>'],

  async main(ctx) {
    await initializeCustomPatterns();
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
        case 'PHONE':
          // This function replaces any digit with a '•' if it's not one of the last 4 digits in the string.
          return detection.value.replace(/(\d)/g, (match, _, offset) => {
            const digitsToEnd = (
              detection.value.substring(offset).match(/\d/g) || []
            ).length;
            return digitsToEnd > 4 ? '•' : match;
          });
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
        const currentText = getInputValue(activeInput);

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
              inputText={currentText}
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
              inputText={currentText}
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
        const result = await browser.storage.local.get("apiKey");
        const apiKey = result.apiKey as string | undefined;

        if (!apiKey) {
          return;
        }

        // Initialize API client
        const apiClient = initializeApiClient(apiKey);

        // Fetch custom patterns
        const patterns = await apiClient.getPatterns();
        setCustomPatterns(patterns);

      } catch (error) {
        console.error("Failed to load custom patterns:", error);
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
