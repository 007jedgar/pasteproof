// src/entrypoints/content.tsx
import {
  detectPii,
  DetectionResult,
  setCustomPatterns,
} from '@/shared/pii-detector';
import ReactDOM from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { getApiClient, initializeApiClient } from '@/shared/api-client';
import { SimpleWarningBadge } from '@/shared/components';
import { aiScanOptimizer } from '@/shared/ai-scan-optimizer';

let authToken: string | null = null;

// Simple in-memory cache for AI scan results
const aiScanCache = new Map<string, {
  detections: any[];
  timestamp: number;
}>();

const CACHE_DURATION = 30000; // 30 seconds
const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 5000;

// Detection queue for batch logging
class DetectionQueue {
  private queue: Array<{
    type: string;
    domain: string;
    action: 'detected' | 'blocked' | 'anonymized';
    metadata?: Record<string, any>;
  }> = [];
  private processing = false;
  private readonly BATCH_SIZE = 10;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  constructor() {
    // Auto-flush periodically
    setInterval(() => this.flush(), this.FLUSH_INTERVAL);
  }

  add(detection: {
    type: string;
    domain: string;
    action: 'detected' | 'blocked' | 'anonymized';
    metadata?: Record<string, any>;
  }) {
    this.queue.push(detection);
    
    // Flush if queue gets large
    if (this.queue.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }

  async flush() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    try {
      const apiClient = getApiClient();
      if (!apiClient) {
        this.processing = false;
        return;
      }

      const batch = this.queue.splice(0, this.BATCH_SIZE);
      
      try {
        await apiClient.logDetectionsBatch(batch);
      } catch (error) {
        console.warn('Failed to log detections batch:', error);
        // Don't re-queue on failure to avoid infinite loops
      }
    } finally {
      this.processing = false;
    }
  }
}

const detectionQueue = new DetectionQueue();

export default defineContentScript({
  matches: ['<all_urls>'],

  async main(ctx) {
    let authToken = await storage.getItem<string>('local:authToken');
    const enabled = await storage.getItem<boolean>('local:enabled') ?? true;
    const autoAiScan = await storage.getItem<boolean>('local:autoAiScan') ?? true;
    if (!enabled) {
      console.log('Paste Proof is disabled');
      return;
    }

    // ============================================
    // AUTH LISTENERS
    // ============================================
    
    window.addEventListener('message', async (event) => {
      const trustedDomains = ['pasteproof.com', 'localhost', 'vercel.app'];
      const isTrusted = trustedDomains.some(domain => event.origin.includes(domain));
      
      if (!isTrusted) return;

      if (event.data.type === 'PASTEPROOF_AUTH_SUCCESS') {
        
        await storage.setItem('local:authToken', event.data.authToken);
        await storage.setItem('local:user', event.data.user);
        
        authToken = event.data.authToken;
        
        initializeApiClient(event.data.authToken);
      }
    });

    window.addEventListener('pasteproof-auth', async (event: any) => {
      const { authToken: token, user } = event.detail;
      
      await storage.setItem('local:authToken', token);
      await storage.setItem('local:user', user);
      
      authToken = token;
      initializeApiClient(token);
    });

    // Check localStorage on auth page
    const currentHostname = window.location.hostname;
    if (currentHostname.includes('pasteproof') || 
        currentHostname.includes('localhost') || 
        currentHostname.includes('vercel.app')) {
      try {
        const token = localStorage.getItem('pasteproof_auth_token');
        const userStr = localStorage.getItem('pasteproof_user');
        
        if (token && userStr) {
          const user = JSON.parse(userStr);
          
          await browser.storage.local.set({
            authToken: token,
            user,
          });
          
          localStorage.removeItem('pasteproof_auth_token');
          localStorage.removeItem('pasteproof_user');
          
          authToken = token;
          initializeApiClient(token);
        }
      } catch (err) {
        console.log('Could not check localStorage:', err);
      }
    }
    
    if (authToken) {
      const currentDomain = window.location.hostname;
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/whitelist/check/${currentDomain}`,
          {
            headers: {
              'X-API-Key': authToken,
            },
          }
        );
        const data = await response.json();
        
        if (data.whitelisted) {
          console.log(`Paste Proof: ${currentDomain} is whitelisted - skipping`);
          return;
        }
      } catch (error) {
        console.error('Failed to check whitelist:', error);
      }
    }

    await initializeCustomPatterns();
    let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;
    let badgeContainer: HTMLDivElement | null = null;
    let dotContainer: HTMLDivElement | null = null;
    let badgeRoot: Root | null = null;
    let dotRoot: Root | null = null;
    let isPopupOpen = false;
    let lastScannedText = '';
    let contextMenuInput: HTMLInputElement | HTMLTextAreaElement | null = null;

    // Helper function to check if text should be scanned
    const shouldScanText = (text: string): boolean => {
      if (!text || text.trim().length < MIN_TEXT_LENGTH) return false;
      if (text.length > MAX_TEXT_LENGTH) return false;
      
      const trimmed = text.trim();
      if (trimmed.length < MIN_TEXT_LENGTH) return false;
      
      const uniqueChars = new Set(text).size;
      if (uniqueChars < 5 && text.length > 20) return false;
      
      return true;
    };

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
          const cleaned = detection.value.replace(/\s/g, '');
          const last4 = cleaned.slice(-4);
          const masked = '•'.repeat(cleaned.length - 4);
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

    const isContentEditable = activeInput.getAttribute('contenteditable') === 'true';
    let newValue: string;
    
    if (isContentEditable) {
      newValue = activeInput.textContent || '';
    } else {
      newValue = (activeInput as HTMLInputElement | HTMLTextAreaElement).value;
    }

    // Sort detections by value length (longest first) to avoid partial replacements
    const sortedDetections = [...detections].sort(
      (a, b) => b.value.length - a.value.length
    );

    // Replace all detected values with anonymized versions
    sortedDetections.forEach(d => {
      const anonymized = anonymizeValue(d);
      newValue = newValue.replace(d.value, anonymized);
    });

    // Set the new value based on element type
    if (isContentEditable) {
      activeInput.textContent = newValue;
      activeInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      activeInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    } else {
      const input = activeInput as HTMLInputElement | HTMLTextAreaElement;
      
      const nativeSetter = Object.getOwnPropertyDescriptor(
        input.tagName === 'INPUT' 
          ? window.HTMLInputElement.prototype 
          : window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;

      if (nativeSetter) {
        nativeSetter.call(input, newValue);
      } else {
        input.value = newValue;
      }

      input.setAttribute('value', newValue);

      const events = [
        new Event('input', { bubbles: true, cancelable: true }),
        new Event('change', { bubbles: true, cancelable: true }),
        new InputEvent('input', { 
          bubbles: true, 
          cancelable: true, 
          inputType: 'insertText',
          data: newValue 
        }),
        new Event('blur', { bubbles: true }),
        new Event('keyup', { bubbles: true }),
      ];

      events.forEach(event => {
        try {
          input.dispatchEvent(event);
        } catch (e) {
          console.warn('Failed to dispatch event:', event.type, e);
        }
      });

      setTimeout(() => {
        input.blur();
        setTimeout(() => {
          input.focus();
        }, 10);
      }, 10);
    }

    // Log anonymizations
    const domain = window.location.hostname;
    sortedDetections.forEach(detection => {
      detectionQueue.add({
        type: detection.type,
        domain,
        action: 'anonymized',
        metadata: {
          originalLength: detection.value.length,
          pattern: detection.patternName,
        }
      });
    });

    // Clear AI scan cache for this text after anonymization
    const cacheKey = getCacheKey(newValue);
    aiScanCache.delete(cacheKey);
    
    // Clear the optimizer cache as well
    aiScanOptimizer.clearCache();
    
    // Update lastScannedText to force fresh scan
    lastScannedText = '';

    // Re-scan after anonymization WITHOUT AI detections initially
    // This prevents showing stale AI results
    setTimeout(async () => {
      if (!activeInput) return;
      
      const currentValue = getInputValue(activeInput);
      const results = detectPii(currentValue);
      
      // First show just pattern-based results (AI cache is cleared)
      handleDetection(results, null);
      
      // Optionally trigger a fresh AI scan after a short delay
      // This allows users to see immediate feedback before AI re-scans
      if (autoAiScan && aiScanOptimizer.shouldScan(currentValue)) {
        setTimeout(async () => {
          if (!activeInput) return;
          const freshAiDetections = await performAiScan(activeInput, currentValue);
          const freshResults = detectPii(getInputValue(activeInput));
          handleDetection(freshResults, freshAiDetections);
        }, 500); // Wait 500ms before re-running AI scan
      }
    }, 100);
  };

    // Helper function to create cache key
    const getCacheKey = (text: string): string => {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash.toString(36);
    };

    const isAlreadyRedacted = (text: string): boolean => {
      // Check if the text contains common redaction patterns
      const redactionPatterns = [
        /\[REDACTED\]/gi,
        /\[REMOVED\]/gi,
        /\[HIDDEN\]/gi,
        /•{4,}/g,  // Multiple dots (••••)
        /\*{4,}/g, // Multiple asterisks (****)
        /X{4,}/gi, // Multiple X's (XXXX)
      ];
      
      return redactionPatterns.some(pattern => pattern.test(text));
    };

    const hasMinimalContent = (text: string): boolean => {
      // Remove common redaction patterns
      const cleanedText = text
        .replace(/\[REDACTED\]/gi, '')
        .replace(/\[REMOVED\]/gi, '')
        .replace(/\[HIDDEN\]/gi, '')
        .replace(/•+/g, '')
        .replace(/\*+/g, '')
        .replace(/X{4,}/gi, '')
        .trim();
      
      // If there's very little content left after removing redactions, skip AI scan
      return cleanedText.length >= MIN_TEXT_LENGTH;
    };    

    // Perform AI scan on input with optimization
    const performAiScan = async (
      input: HTMLElement,
      text: string
    ): Promise<any[] | null> => {
      if (!shouldScanText(text)) {
        return null;
      }

      if (isAlreadyRedacted(text) && !hasMinimalContent(text)) {
        console.log('Skipping AI scan - text is already redacted');
        return null;
      }

      const cacheKey = getCacheKey(text);
      const cached = aiScanCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('Using cached AI scan result');
        return cached.detections;
      }

      try {
        const apiClient = getApiClient();
        if (!apiClient) {
          console.log('No API client - skipping AI scan');
          return null;
        }

        const result = await apiClient.analyzeContext(
          text,
          window.location.hostname
        );

        const detections = result.detections || [];
        
        // Filter out detections that are pointing to already redacted content
        const filteredDetections = detections.filter((detection: any) => {
          const value = detection.value || '';
          // Skip if the detected value is a redaction marker
          if (value.includes('[REDACTED]') || 
              value.includes('[REMOVED]') || 
              value.includes('[HIDDEN]') ||
              /•{4,}/.test(value) ||
              /\*{4,}/.test(value)) {
            return false;
          }
          return true;
        });
        
        // Log AI detections (only the filtered ones)
        if (filteredDetections.length > 0) {
          const domain = window.location.hostname;
          filteredDetections.forEach((detection: any) => {
            detectionQueue.add({
              type: detection.type,
              domain,
              action: 'detected',
              metadata: {
                confidence: detection.confidence,
                reason: detection.reason,
                risk_level: result.risk_level,
                source: 'ai',
              }
            });
          });
        }
        
        aiScanCache.set(cacheKey, {
          detections: filteredDetections,
          timestamp: Date.now(),
        });

        // Clean old cache entries
        for (const [key, entry] of aiScanCache.entries()) {
          if (Date.now() - entry.timestamp > CACHE_DURATION) {
            aiScanCache.delete(key);
          }
        }

        return filteredDetections;
      } catch (error: any) {
        console.error('AI scan error:', error);
        if (
          error.message?.includes('Premium subscription required') ||
          error.message?.includes('Rate limit exceeded')
        ) {
          console.log('AI scan not available:', error.message);
        }
        return null;
      }
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

    const createDotContainer = (
      input: HTMLInputElement | HTMLTextAreaElement
    ): HTMLDivElement => {
      const container = document.createElement('div');
      container.id = `pii-dot-${Math.random().toString(36).substr(2, 9)}`;

      // Position dot on right side, slightly below the badge position to avoid overlap
      container.style.cssText = `
        position: absolute !important;
        top: 40px !important;
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
        container.style.top = `${rect.top + 40}px !important`;
        container.style.left = `${rect.right - 20}px !important`;
        document.body.appendChild(container);
      }

      return container;
    };

    const handleDetection = async (
      detections: DetectionResult[],
      aiDetections: any[] | null = null
    ) => {
      // Log pattern-based detections
      if (detections.length > 0 && !badgeContainer && !dotContainer) {
        const domain = window.location.hostname;
        detections.forEach(detection => {
          detectionQueue.add({
            type: detection.type,
            domain,
            action: 'detected',
            metadata: {
              confidence: detection.confidence,
              pattern: detection.patternName,
              source: 'pattern',
            }
          });
        });
      }

      const hasPatternDetections = detections.length > 0;
      const hasAiDetections = aiDetections && aiDetections.length > 0;
      const hasAnyDetections = hasPatternDetections || hasAiDetections;
      
      if (!activeInput) return;
      
      // Show full badge if there are actual detections (pattern or AI)
      if (hasAnyDetections) {
        removeDot(); // Remove dot if full badge is shown
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
              }}
              inputText={currentText}
              initialAiDetections={aiDetections || undefined}
              variant="full"
            />
          );
        } else if (badgeRoot) {
          badgeRoot.render(
            <SimpleWarningBadge
              detections={detections}
              onAnonymize={handleAnonymize}
              onPopupStateChange={isOpen => {
                isPopupOpen = isOpen;
              }}
              inputText={currentText}
              initialAiDetections={aiDetections || undefined}
              variant="full"
            />
          );
        }
      } else {
        // No detections - show small dot indicator
        removeBadge(); // Remove full badge if showing dot
        const currentText = getInputValue(activeInput);

        if (!dotContainer) {
          dotContainer = createDotContainer(activeInput);
          dotContainer.offsetHeight;

          dotRoot = ReactDOM.createRoot(dotContainer);
          dotRoot.render(
            <SimpleWarningBadge
              detections={[]}
              onAnonymize={handleAnonymize}
              onPopupStateChange={isOpen => {
                isPopupOpen = isOpen;
              }}
              inputText={currentText}
              initialAiDetections={aiDetections || undefined}
              variant="dot"
              alwaysShowDot={true}
            />
          );
        } else if (dotRoot) {
          dotRoot.render(
            <SimpleWarningBadge
              detections={[]}
              onAnonymize={handleAnonymize}
              onPopupStateChange={isOpen => {
                isPopupOpen = isOpen;
              }}
              inputText={currentText}
              initialAiDetections={aiDetections || undefined}
              variant="dot"
              alwaysShowDot={true}
            />
          );
        }
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
    };

    const removeDot = () => {
      if (dotRoot) {
        dotRoot.unmount();
        dotRoot = null;
      }
      if (dotContainer) {
        dotContainer.remove();
        dotContainer = null;
      }
    };

    const removeAllIndicators = () => {
      removeBadge();
      removeDot();
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

    // Debounced scan with AI scan and optimization
    const debouncedScan = debounce(async (text: string, input: HTMLElement) => {
      const results = detectPii(text);
      let aiDetections: any[] | null = null;
      if (autoAiScan && aiScanOptimizer.shouldScan(text)) {
        if (aiScanOptimizer.hasSignificantChange(lastScannedText, text)) {
          aiDetections = await performAiScan(input, text);
          lastScannedText = text;
        } else {
          aiDetections = aiScanOptimizer.getCachedResult(text);
        }
      }
      
      handleDetection(results, aiDetections);
    }, 800);

    // Manual rescan function for context menu
    const manualRescan = async () => {
      if (!contextMenuInput) return;
      
      const currentValue = getInputValue(contextMenuInput);
      const results = detectPii(currentValue);
      
      // Force AI scan regardless of cache
      let aiDetections: any[] | null = null;
      if (autoAiScan && shouldScanText(currentValue)) {
        aiDetections = await performAiScan(contextMenuInput, currentValue);
        lastScannedText = currentValue;
      }
      
      handleDetection(results, aiDetections);
      
      // Focus the input after rescan
      contextMenuInput.focus();
    };

    const attachInputListener = (
      input: HTMLInputElement | HTMLTextAreaElement | HTMLElement
    ) => {
      const handler = () => {
        if (activeInput === input) {
          debouncedScan(getInputValue(input), input);
        }
      };

      input.addEventListener('input', handler);

      if (input.getAttribute('contenteditable') === 'true') {
        input.addEventListener('keyup', handler);
      }
    };

    // Context menu setup
    document.addEventListener('contextmenu', (event) => {
      const target = event.target as HTMLElement;
      
      if (isValidInput(target)) {
        contextMenuInput = target as HTMLInputElement | HTMLTextAreaElement;
      } else {
        contextMenuInput = null;
      }
    });

    // Listen for context menu action from background script
    browser.runtime.onMessage.addListener((message) => {
      if (message.action === 'rescanForPii') {
        manualRescan();
      }
    });

    document.addEventListener(
      'focusin',
      async event => {
        const target = event.target as HTMLElement;

        if (!isValidInput(target)) return;

        removeAllIndicators();

        activeInput = target as HTMLInputElement | HTMLTextAreaElement;
        const currentValue = getInputValue(activeInput);
        const results = detectPii(currentValue);
        let aiDetections: any[] | null = null;
        if (autoAiScan && aiScanOptimizer.shouldScan(currentValue)) {
          aiDetections = await performAiScan(activeInput, currentValue);
          lastScannedText = currentValue;
        }
        
        handleDetection(results, aiDetections);

        attachInputListener(activeInput);
      },
      true
    );

    document.addEventListener(
      'focusout',
      event => {
        const relatedTarget = event.relatedTarget as Node;

        if ((badgeContainer?.contains(relatedTarget) || dotContainer?.contains(relatedTarget)) || isPopupOpen) {
          return;
        }

        setTimeout(() => {
          const currentFocus = document.activeElement;

          if (isPopupOpen) {
            return;
          }

          if (currentFocus !== activeInput) {
            removeAllIndicators();
            activeInput = null;
          }
        }, 100);
      },
      true
    );

    document.addEventListener('mousedown', event => {
      if (
        isPopupOpen &&
        badgeContainer &&
        !badgeContainer.contains(event.target as Node) &&
        dotContainer &&
        !dotContainer.contains(event.target as Node)
      ) {
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
              variant="full"
            />
          );
        }
      }
    });

    // Flush detection queue before unload
    ctx.onInvalidated(() => {
      removeAllIndicators();
      aiScanOptimizer.clearCache();
      detectionQueue.flush();
    });

    async function initializeCustomPatterns() {
      try {
        const token = await storage.getItem<string>('local:authToken');

        if (!token) {
          console.log('No auth token, skipping custom patterns');
          return;
        }

        const apiClient = initializeApiClient(token);
        
        try {
          const patterns = await apiClient.getPatterns();
          
          if (patterns && patterns.length > 0) {
            setCustomPatterns(patterns);
          } else {
            console.log('No custom patterns found');
          }
        } catch (apiError) {
          console.error("Failed to fetch patterns from API:", apiError);
        }

      } catch (error) {
        console.error("Failed to load custom patterns:", error);
      }
    }

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.authToken) {
          const newToken = changes.authToken.newValue;
          if (newToken) {
            authToken = newToken;
            initializeApiClient(newToken);
            initializeCustomPatterns();
          }
        }
        if (changes.autoAiScan) {
          console.log('Auto AI scan setting changed:', changes.autoAiScan.newValue);
        }
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