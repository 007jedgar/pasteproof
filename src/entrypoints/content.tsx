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
        console.log(`Logged ${batch.length} detections`);
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
    console.log('extension enabled:', enabled);
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
        console.log('✅ Received auth from web page!', event.data);
        
        await storage.setItem('local:authToken', event.data.authToken);
        await storage.setItem('local:user', event.data.user);
        
        console.log('✅ Auth saved to extension storage');
        authToken = event.data.authToken;
        
        initializeApiClient(event.data.authToken);
      }
    });

    window.addEventListener('pasteproof-auth', async (event: any) => {
      const { authToken: token, user } = event.detail;
      
      await storage.setItem('local:authToken', token);
      await storage.setItem('local:user', user);
      
      console.log('✅ Auth saved via custom event');
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
          
          console.log('✅ Auth loaded from localStorage');
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
    let badgeRoot: Root | null = null;
    let isPopupOpen = false;
    let lastScannedText = '';

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

      let newValue = activeInput.value;
      const sortedDetections = [...detections].sort(
        (a, b) => b.value.length - a.value.length
      );

      sortedDetections.forEach(d => {
        const anonymized = anonymizeValue(d);
        newValue = newValue.replace(d.value, anonymized);
      });

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;

      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;

      if (activeInput.tagName === 'INPUT' && nativeInputValueSetter) {
        nativeInputValueSetter.call(activeInput, newValue);
      } else if (activeInput.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(activeInput, newValue);
      } else {
        activeInput.value = newValue;
      }

      // Dispatch input event but DON'T dispatch submit/change
      activeInput.dispatchEvent(new InputEvent('input', { 
        bubbles: true,
        cancelable: true,
        inputType: 'insertText'
      }));

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

      const results = detectPii(newValue);
      handleDetection(results);
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

    // Perform AI scan on input with optimization
    const performAiScan = async (
      input: HTMLElement,
      text: string
    ): Promise<any[] | null> => {
      if (!shouldScanText(text)) {
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

        console.log('Performing AI scan on input...');
        const result = await apiClient.analyzeContext(
          text,
          window.location.hostname
        );

        const detections = result.detections || [];
        
        // Log AI detections
        if (detections.length > 0) {
          const domain = window.location.hostname;
          detections.forEach((detection: any) => {
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
          detections,
          timestamp: Date.now(),
        });

        // Clean old cache entries
        for (const [key, entry] of aiScanCache.entries()) {
          if (Date.now() - entry.timestamp > CACHE_DURATION) {
            aiScanCache.delete(key);
          }
        }

        return detections;
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

    const handleDetection = async (
      detections: DetectionResult[],
      aiDetections: any[] | null = null
    ) => {
      // Log pattern-based detections
      if (detections.length > 0 && !badgeContainer) {
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
              }}
              inputText={currentText}
              initialAiDetections={aiDetections || undefined}
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

    document.addEventListener(
      'focusin',
      async event => {
        const target = event.target as HTMLElement;

        if (!isValidInput(target)) return;

        removeBadge();

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

        if (badgeContainer?.contains(relatedTarget) || isPopupOpen) {
          return;
        }

        setTimeout(() => {
          const currentFocus = document.activeElement;

          if (isPopupOpen) {
            return;
          }

          if (currentFocus !== activeInput) {
            removeBadge();
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
        !badgeContainer.contains(event.target as Node)
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
            />
          );
        }
      }
    });

    // Flush detection queue before unload
    ctx.onInvalidated(() => {
      removeBadge();
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
          console.log('Loaded custom patterns:', patterns);
          
          if (patterns && patterns.length > 0) {
            setCustomPatterns(patterns);
            console.log(`✅ ${patterns.length} custom patterns loaded`);
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
          console.log('API key changed - reloading patterns');
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