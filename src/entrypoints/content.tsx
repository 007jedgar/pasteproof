// src/entrypoints/content.tsx
import {
  detectPii,
  DetectionResult,
  setCustomPatterns,
} from '@/shared/pii-detector';
import ReactDOM from 'react-dom/client';
import type { Root } from 'react-dom/client';
import {
  getApiClient,
  initializeApiClient,
  type TeamPolicy,
} from '@/shared/api-client';
import { SimpleWarningBadge } from '@/shared/components';
import { aiScanOptimizer } from '@/shared/ai-scan-optimizer';

const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 5000;

// Detection queue for batch logging
class DetectionQueue {
  private queue: Array<{
    type: string;
    domain: string;
    action: 'detected' | 'blocked' | 'anonymized';
    metadata?: Record<string, any>;
    team_id?: string | null;
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
    team_id?: string | null;
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
    const enabled = (await storage.getItem<boolean>('local:enabled')) ?? true;
    const autoAiScan =
      (await storage.getItem<boolean>('local:autoAiScan')) ?? true;
    if (!enabled) {
      return;
    }

    // ============================================
    // AUTH LISTENERS
    // ============================================

    /**
     * Validates origin to prevent subdomain attacks
     */
    const isValidOrigin = (origin: string): boolean => {
      try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();

        // Check for pasteproof.com and all its subdomains (api.pasteproof.com, www.pasteproof.com, etc.)
        if (
          hostname === 'pasteproof.com' ||
          hostname.endsWith('.pasteproof.com')
        ) {
          return true;
        }

        // Exact matches for other trusted domains
        const trustedDomains = ['localhost', '127.0.0.1'];
        if (trustedDomains.includes(hostname)) {
          return true;
        }

        // Check for vercel.app subdomains (pasteproof-*.vercel.app)
        if (hostname.endsWith('.vercel.app')) {
          const subdomain = hostname.replace('.vercel.app', '');
          // Only allow pasteproof-related subdomains
          if (subdomain.startsWith('pasteproof')) {
            return true;
          }
        }

        return false;
      } catch {
        return false;
      }
    };

    window.addEventListener('message', async event => {
      // Validate origin to prevent subdomain attacks
      if (!isValidOrigin(event.origin)) {
        return;
      }

      if (event.data.type === 'PASTEPROOF_AUTH_SUCCESS') {
        // Validate authToken format
        if (!event.data.authToken || typeof event.data.authToken !== 'string') {
          console.warn('Invalid auth token format');
          return;
        }

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

    // Check localStorage on auth page (legacy support - migrate to extension storage)
    // SECURITY: Only check on trusted domains
    const currentHostname = window.location.hostname.toLowerCase();
    const isTrustedAuthDomain =
      currentHostname === 'pasteproof.com' ||
      currentHostname === 'www.pasteproof.com' ||
      currentHostname === 'localhost' ||
      currentHostname === '127.0.0.1' ||
      (currentHostname.endsWith('.vercel.app') &&
        currentHostname.startsWith('pasteproof'));

    if (isTrustedAuthDomain) {
      try {
        const token = localStorage.getItem('pasteproof_auth_token');
        const userStr = localStorage.getItem('pasteproof_user');

        if (token && userStr) {
          // Validate token format
          if (typeof token !== 'string' || token.length < 10) {
            console.warn('Invalid token format from localStorage');
            return;
          }

          try {
            const user = JSON.parse(userStr);

            // Basic validation of user object
            if (!user || typeof user !== 'object') {
              console.warn('Invalid user object from localStorage');
              return;
            }

            await browser.storage.local.set({
              authToken: token,
              user,
            });

            // Clean up localStorage after migration
            localStorage.removeItem('pasteproof_auth_token');
            localStorage.removeItem('pasteproof_user');

            authToken = token;
            initializeApiClient(token);
          } catch (parseError) {
            console.warn(
              'Failed to parse user data from localStorage:',
              parseError
            );
          }
        }
      } catch (err) {
        console.warn('Error reading from localStorage:', err);
      }
    }

    if (authToken) {
      const currentDomain = window.location.hostname;
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/v1/whitelist/check`,
          {
            method: 'POST',
            headers: {
              'X-API-Key': authToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ domain: currentDomain }),
          }
        );
        const data = await response.json();

        if (data.whitelisted) {
          return;
        }
      } catch (error) {
        console.error('Failed to check whitelist:', error);
      }
    }

    await initializeCustomPatterns();

    // Initialize team policies
    let activeTeamPolicy: TeamPolicy | null = null;
    await initializeWithTeamPolicies();

    let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;
    let badgeContainer: HTMLDivElement | null = null;
    let dotContainer: HTMLDivElement | null = null;
    let badgeRoot: Root | null = null;
    let dotRoot: Root | null = null;
    let isPopupOpen = false;
    let contextMenuInput: HTMLInputElement | HTMLTextAreaElement | null = null;

    // Initialize team policies on page load
    async function initializeWithTeamPolicies() {
      try {
        // Get team_id from extension storage (preferred) or localStorage (legacy)
        // SECURITY: Prefer extension storage over localStorage
        let teamId = await storage.getItem<string>('local:currentTeamId');

        // Fallback to localStorage for legacy support
        // TODO: Remove localStorage fallback in future version
        if (!teamId) {
          const localTeamId = localStorage.getItem('currentTeamId');
          if (localTeamId) {
            // Migrate to extension storage
            await storage.setItem('local:currentTeamId', localTeamId);
            teamId = localTeamId;
          }
        }

        if (!teamId) {
          return; // User not in a team
        }

        // Validate teamId format
        if (!/^[a-zA-Z0-9\-_]+$/.test(teamId)) {
          console.warn('Invalid teamId format');
          return;
        }

        const apiClient = getApiClient();
        if (!apiClient) {
          return;
        }

        const policies = await apiClient.getTeamPolicies(teamId);
        const activePolicy = policies.find(p => p.enabled);

        if (activePolicy) {
          activeTeamPolicy = activePolicy;

          // Apply team policy rules
          const policyData =
            typeof activePolicy.policy_data === 'string'
              ? JSON.parse(activePolicy.policy_data)
              : activePolicy.policy_data;

          const { domainRules, domainBlacklist } = policyData;

          // Check if current domain is blacklisted
          const currentDomain = window.location.hostname;
          if (domainBlacklist?.includes(currentDomain)) {
            // TODO: Show warning/block
          }
        }
      } catch (error) {
        console.error('Error loading team policies:', error);
      }
    }

    // Helper function to get current team_id
    // SECURITY: Prefer extension storage over localStorage
    const getCurrentTeamId = async (): Promise<string | null> => {
      try {
        // First check extension storage (more secure)
        const teamId = await storage.getItem<string>('local:currentTeamId');
        if (teamId) {
          return teamId;
        }
        // Fallback to localStorage for legacy support (less secure)
        // TODO: Remove localStorage fallback in future version
        const localTeamId = localStorage.getItem('currentTeamId');
        if (localTeamId) {
          // Migrate to extension storage
          await storage.setItem('local:currentTeamId', localTeamId);
          return localTeamId;
        }
        return null;
      } catch {
        return null;
      }
    };

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

    // Detect the expected data type based on input attributes
    const getExpectedInputType = (
      element: HTMLInputElement | HTMLTextAreaElement | HTMLElement
    ): Set<string> => {
      const expectedTypes = new Set<string>();

      // Get all text attributes to check
      const attrs = {
        id: element.id?.toLowerCase() || '',
        name: (element as HTMLInputElement).name?.toLowerCase() || '',
        placeholder:
          (element as HTMLInputElement).placeholder?.toLowerCase() || '',
        type: (element as HTMLInputElement).type?.toLowerCase() || '',
        autocomplete: element.getAttribute('autocomplete')?.toLowerCase() || '',
        ariaLabel: element.getAttribute('aria-label')?.toLowerCase() || '',
        title: element.getAttribute('title')?.toLowerCase() || '',
      };

      // Check for associated label
      // SECURITY: Escape CSS selector special characters to prevent injection
      let labelText = '';
      if (element.id) {
        // Escape special CSS selector characters
        const escapedId = element.id.replace(
          /[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g,
          '\\$&'
        );
        try {
          const label = document.querySelector(`label[for="${escapedId}"]`);
          if (label) {
            labelText = label.textContent?.toLowerCase() || '';
          }
        } catch (selectorError) {
          // If selector fails, skip label lookup
          console.warn('Failed to query label selector:', selectorError);
        }
      }

      // Combine all text to search
      const allText = Object.values(attrs).join(' ') + ' ' + labelText;

      // Email patterns
      if (
        attrs.type === 'email' ||
        attrs.autocomplete.includes('email') ||
        /\b(email|e-mail|mail)\b/.test(allText)
      ) {
        expectedTypes.add('EMAIL');
      }

      // Phone patterns
      if (
        attrs.type === 'tel' ||
        attrs.autocomplete.includes('tel') ||
        /\b(phone|telephone|mobile|cell|fax)\b/.test(allText)
      ) {
        expectedTypes.add('PHONE');
      }

      // Password patterns
      if (
        attrs.type === 'password' ||
        attrs.autocomplete.includes('password') ||
        /\b(password|passwd|pwd)\b/.test(allText)
      ) {
        expectedTypes.add('PASSWORD');
      }

      // SSN patterns
      if (
        attrs.autocomplete.includes('ssn') ||
        /\b(ssn|social\s*security|social\s*insurance)\b/.test(allText)
      ) {
        expectedTypes.add('SSN');
      }

      // Credit card patterns
      if (
        attrs.autocomplete.includes('cc-') ||
        attrs.autocomplete === 'cc-number' ||
        /\b(card|credit.*card|debit.*card|cc.*number|card.*number)\b/.test(
          allText
        )
      ) {
        expectedTypes.add('CREDIT_CARD');
      }

      // Date of birth patterns
      if (
        attrs.autocomplete.includes('bday') ||
        /\b(birth.*date|dob|date.*of.*birth)\b/.test(allText)
      ) {
        expectedTypes.add('DATE_OF_BIRTH');
      }

      return expectedTypes;
    };

    // Map expected input types to API fieldType
    const getFieldType = (
      element: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
      expectedTypes: Set<string>
    ): 'name' | 'email' | 'address' | 'phone' | 'freeform' | 'unknown' => {
      // Priority order: email > phone > name > address > freeform > unknown
      if (expectedTypes.has('EMAIL')) {
        return 'email';
      }
      if (expectedTypes.has('PHONE')) {
        return 'phone';
      }

      // Check for name patterns in attributes
      const attrs = {
        id: element.id?.toLowerCase() || '',
        name: (element as HTMLInputElement).name?.toLowerCase() || '',
        placeholder:
          (element as HTMLInputElement).placeholder?.toLowerCase() || '',
        autocomplete: element.getAttribute('autocomplete')?.toLowerCase() || '',
        ariaLabel: element.getAttribute('aria-label')?.toLowerCase() || '',
        title: element.getAttribute('title')?.toLowerCase() || '',
      };

      // Check for associated label
      // SECURITY: Escape CSS selector special characters to prevent injection
      let labelText = '';
      if (element.id) {
        // Escape special CSS selector characters
        const escapedId = element.id.replace(
          /[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g,
          '\\$&'
        );
        try {
          const label = document.querySelector(`label[for="${escapedId}"]`);
          if (label) {
            labelText = label.textContent?.toLowerCase() || '';
          }
        } catch (selectorError) {
          // If selector fails, skip label lookup
          console.warn('Failed to query label selector:', selectorError);
        }
      }

      const allText = Object.values(attrs).join(' ') + ' ' + labelText;

      // Name patterns
      if (
        attrs.autocomplete.includes('name') ||
        attrs.autocomplete === 'given-name' ||
        attrs.autocomplete === 'family-name' ||
        attrs.autocomplete === 'additional-name' ||
        /\b(name|first.*name|last.*name|full.*name|given.*name|family.*name)\b/.test(
          allText
        )
      ) {
        return 'name';
      }

      // Address patterns
      if (
        attrs.autocomplete.includes('address') ||
        attrs.autocomplete === 'street-address' ||
        attrs.autocomplete === 'address-line1' ||
        attrs.autocomplete === 'address-line2' ||
        /\b(address|street|city|zip|postal|location)\b/.test(allText)
      ) {
        return 'address';
      }

      // If it's a textarea or large text input, likely freeform
      if (
        element.tagName === 'TEXTAREA' ||
        (element.tagName === 'INPUT' &&
          (element as HTMLInputElement).type === 'text' &&
          !expectedTypes.size)
      ) {
        return 'freeform';
      }

      return 'unknown';
    };

    // Check if we should skip AI scanning for this input
    const shouldSkipAiForInput = (
      element: HTMLInputElement | HTMLTextAreaElement | HTMLElement
    ): boolean => {
      const expectedTypes = getExpectedInputType(element);

      // Skip AI scanning if the input is clearly meant for sensitive data
      // (user is expected to enter this type of data)
      return expectedTypes.size > 0;
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

      const isContentEditable =
        activeInput.getAttribute('contenteditable') === 'true';
      let newValue: string;

      if (isContentEditable) {
        newValue = activeInput.textContent || '';
      } else {
        newValue = (activeInput as HTMLInputElement | HTMLTextAreaElement)
          .value;
      }

      // Sort detections by value length (longest first) to avoid partial replacements
      const sortedDetections = [...detections].sort(
        (a, b) => b.value.length - a.value.length
      );

      // Replace all detected values with anonymized versions
      // SECURITY: Use literal string replacement to prevent regex injection
      sortedDetections.forEach(d => {
        const anonymized = anonymizeValue(d);
        // Escape special regex characters in the search string for literal replacement
        const escapedValue = d.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        newValue = newValue.replace(new RegExp(escapedValue, 'g'), anonymized);
      });

      // Set the new value based on element type
      if (isContentEditable) {
        activeInput.textContent = newValue;
        activeInput.dispatchEvent(
          new Event('input', { bubbles: true, cancelable: true })
        );
        activeInput.dispatchEvent(
          new Event('change', { bubbles: true, cancelable: true })
        );
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
            data: newValue,
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
      const teamId = await getCurrentTeamId();
      sortedDetections.forEach(detection => {
        detectionQueue.add({
          type: detection.type,
          domain,
          action: 'anonymized',
          metadata: {
            originalLength: detection.value.length,
            pattern: detection.patternName,
          },
          team_id: teamId,
        });
      });

      // Clear AI scan cache after anonymization
      aiScanOptimizer.clearCache();

      // Re-scan after anonymization WITHOUT AI detections initially
      // This prevents showing stale AI results
      setTimeout(async () => {
        if (!activeInput) return;

        const expectedTypes = getExpectedInputType(activeInput);
        const skipAi = shouldSkipAiForInput(activeInput);

        const currentValue = getInputValue(activeInput);
        const results = detectPii(currentValue);
        const filteredResults = filterExpectedDetections(
          results,
          expectedTypes
        );

        // First show just pattern-based results (AI cache is cleared)
        handleDetection(filteredResults, null);

        // Optionally trigger a fresh AI scan after a short delay
        // This allows users to see immediate feedback before AI re-scans
        if (autoAiScan && !skipAi && aiScanOptimizer.shouldScan(currentValue)) {
          setTimeout(async () => {
            if (!activeInput) return;

            const freshExpectedTypes = getExpectedInputType(activeInput);
            const freshResults = detectPii(getInputValue(activeInput));
            const freshFiltered = filterExpectedDetections(
              freshResults,
              freshExpectedTypes
            );
            const freshAiDetections = await performAiScan(
              activeInput,
              currentValue,
              freshFiltered
            );
            handleDetection(freshFiltered, freshAiDetections);
          }, 500); // Wait 500ms before re-running AI scan
        }
      }, 100);
    };

    const isAlreadyRedacted = (text: string): boolean => {
      // Check if the text contains common redaction patterns
      const redactionPatterns = [
        /\[REDACTED\]/gi,
        /\[REMOVED\]/gi,
        /\[HIDDEN\]/gi,
        /•{4,}/g, // Multiple dots (••••)
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

    // High-confidence patterns that should be detected locally and redacted before AI
    const highConfidencePatterns = [
      {
        type: 'API_KEY',
        pattern:
          /(?:api[_-]?key|apikey)["\s:=]+["']?([a-zA-Z0-9_\-]{20,})["']?/gi,
      },
      {
        type: 'AWS_KEY',
        pattern: /AKIA[0-9A-Z]{16}/g,
      },
      {
        type: 'PRIVATE_KEY',
        pattern:
          /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[A-Za-z0-9+\/=\s\n\r]+-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/gs,
      },
      {
        type: 'SSN',
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      },
      {
        type: 'CREDIT_CARD',
        pattern:
          /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      },
      // HIPAA patterns
      {
        type: 'HIPAA_MRN',
        pattern: /\bMRN[-\s]?\d{6,12}\b/gi,
      },
      {
        type: 'HIPAA_ACCOUNT',
        pattern: /\bAccount[-\s]?(?:Number|#)?[-\s]?\d{6,12}\b/gi,
      },
      {
        type: 'HIPAA_DOB',
        pattern:
          /\b(?:DOB|Date of Birth)[-\s:]?\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
      },
      // PCI-DSS patterns
      {
        type: 'PCI_CVV',
        pattern:
          /\b(?:CVV|CVC|Card Verification)[-\s]?(?:Value|Code)?[-\s]?\d{3,4}\b/gi,
      },
      {
        type: 'PCI_PAN',
        pattern: /\b(?:PAN|Primary Account Number)[-\s]?\d{13,19}\b/gi,
      },
      {
        type: 'PCI_TRACK',
        pattern: /\b%?[A-Z]\d{13,19}=[\d?]{4,}\b/g,
      },
      {
        type: 'PCI_EXPIRY',
        pattern: /\b(?:Exp|Expiry|Expiration)[-\s:]?\d{1,2}[/-]\d{2,4}\b/gi,
      },
      // GDPR patterns
      {
        type: 'GDPR_PASSPORT',
        pattern:
          /\b(?:Passport|Passport Number|Passport #)[-\s:]?[A-Z0-9]{6,9}\b/gi,
      },
      {
        type: 'GDPR_NIN',
        pattern: /\b(?:NI|NINO|National Insurance)[-\s]?[A-Z]{2}\d{6}[A-Z]\b/gi,
      },
      {
        type: 'GDPR_IBAN',
        pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,
      },
    ];

    // Detect high-confidence patterns locally
    const detectLocally = (
      text: string,
      patterns: Array<{ type: string; pattern: RegExp }>
    ): Array<{ type: string; value: string; start?: number; end?: number }> => {
      const detections: Array<{
        type: string;
        value: string;
        start?: number;
        end?: number;
      }> = [];

      for (const { type, pattern } of patterns) {
        // Reset regex lastIndex for global patterns
        pattern.lastIndex = 0;
        const matches = text.matchAll(pattern);

        for (const match of matches) {
          const value = match[0];
          detections.push({
            type,
            value,
            start: match.index,
            end:
              match.index !== undefined
                ? match.index + value.length
                : undefined,
          });
        }
      }

      // Remove duplicates
      return detections.filter(
        (result, index, self) =>
          index ===
          self.findIndex(
            r =>
              r.type === result.type &&
              r.value === result.value &&
              r.start === result.start
          )
      );
    };

    // Redact detected secrets from text
    const redactSecrets = (
      text: string,
      detections: Array<{
        type: string;
        value: string;
        start?: number;
        end?: number;
      }>
    ): string => {
      if (detections.length === 0) return text;

      // Sort by start position (descending) to replace from end to start
      const sorted = [...detections].sort(
        (a, b) => (b.start || 0) - (a.start || 0)
      );

      let redactedText = text;
      for (const detection of sorted) {
        if (detection.start !== undefined && detection.end !== undefined) {
          const before = redactedText.substring(0, detection.start);
          const after = redactedText.substring(detection.end);
          const redaction = `[REDACTED_${detection.type}]`;
          redactedText = before + redaction + after;
        }
      }

      return redactedText;
    };

    // Perform AI scan on input with optimization
    const performAiScan = async (
      input: HTMLElement,
      text: string,
      existingPatternDetections: DetectionResult[] = []
    ): Promise<any[] | null> => {
      const textPreview =
        text.length > 50 ? text.substring(0, 50) + '...' : text;

      if (!shouldScanText(text)) {
        return null;
      }

      if (isAlreadyRedacted(text) && !hasMinimalContent(text)) {
        return null;
      }

      // Check cache first using the optimizer
      const cachedResult = aiScanOptimizer.getCachedResult(text);
      if (cachedResult !== null) {
        return cachedResult;
      }

      // Detect high-confidence patterns locally first
      const localDetections = detectLocally(text, highConfidencePatterns);

      // Filter out local detections that are already detected by pattern detections
      // This prevents duplicates between Pattern Match and AI Scan tabs
      // Check both exact match (value+type) and value-only match (same value detected differently)
      const uniqueLocalDetections = localDetections.filter(localDet => {
        return !existingPatternDetections.some(
          patternDet => patternDet.value === localDet.value
        );
      });

      // If we find PRIVATE_KEY or AWS_KEY, return immediately without sending to AI
      if (
        uniqueLocalDetections.some(
          d => d.type === 'PRIVATE_KEY' || d.type === 'AWS_KEY'
        )
      ) {
        // Log all unique local detections (including PRIVATE_KEY and AWS_KEY)
        const domain = window.location.hostname;
        const teamId = await getCurrentTeamId();
        uniqueLocalDetections.forEach((detection: any) => {
          detectionQueue.add({
            type: detection.type,
            domain,
            action: 'detected',
            metadata: {
              confidence: 100,
              reason:
                detection.type === 'PRIVATE_KEY' || detection.type === 'AWS_KEY'
                  ? 'High-confidence local detection - not sent to AI'
                  : 'Detected locally - high confidence pattern',
              risk_level: 'critical',
              source: 'local',
            },
            team_id: teamId,
          });
        });

        // Return all unique local detections formatted for AI detection format
        return uniqueLocalDetections.map(d => ({
          type: d.type,
          value: d.value,
          confidence: 100,
          reason: 'Detected locally - high confidence pattern',
          source: 'local',
        }));
      }

      // Redact detected secrets before sending to AI (use all local detections for redaction)
      const redactedText = redactSecrets(text, localDetections);

      try {
        const apiClient = getApiClient();
        if (!apiClient) {
          return null;
        }

        const startTime = performance.now();

        // Determine fieldType from input element
        const expectedTypes = getExpectedInputType(input);
        const fieldType = getFieldType(input, expectedTypes);

        // Send redacted text to AI
        const result = await apiClient.analyzeContext(
          redactedText,
          window.location.hostname,
          fieldType
        );

        const duration = Math.round(performance.now() - startTime);

        const detections = result.detections || [];

        // Combine unique local detections with AI detections
        // Filter out local detections that duplicate pattern detections
        const allDetections = [
          ...uniqueLocalDetections.map(d => ({
            type: d.type,
            value: d.value,
            confidence: 100,
            reason: 'Detected locally - high confidence pattern',
            source: 'local',
          })),
          ...detections.map((d: any) => ({
            ...d,
            source: 'ai',
          })),
        ];

        // Filter out detections that are pointing to already redacted content
        const filteredDetections = allDetections.filter((detection: any) => {
          const value = detection.value || '';
          // Skip if the detected value is a redaction marker
          if (
            value.includes('[REDACTED]') ||
            value.includes('[REMOVED]') ||
            value.includes('[HIDDEN]') ||
            /•{4,}/.test(value) ||
            /\*{4,}/.test(value) ||
            value.includes('[REDACTED_')
          ) {
            return false;
          }
          return true;
        });

        if (filteredDetections.length !== detections.length) {
        }
        filteredDetections.forEach((d, idx) => {});

        // Log all detections (local + AI)
        if (filteredDetections.length > 0) {
          const domain = window.location.hostname;
          const teamId = await getCurrentTeamId();
          filteredDetections.forEach((detection: any) => {
            detectionQueue.add({
              type: detection.type,
              domain,
              action: 'detected',
              metadata: {
                confidence: detection.confidence || 100,
                reason: detection.reason || 'Detected',
                risk_level:
                  detection.source === 'local' ? 'critical' : result.risk_level,
                source: detection.source || 'ai',
              },
              team_id: teamId,
            });
          });
        }

        // Cache the result using the optimizer
        aiScanOptimizer.cacheResult(text, filteredDetections);

        return filteredDetections;
      } catch (error: any) {
        console.error('AI scan error:', error);
        if (
          error.message?.includes('Premium subscription required') ||
          error.message?.includes('Rate limit exceeded')
        ) {
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
        const teamId = await getCurrentTeamId();
        detections.forEach(detection => {
          detectionQueue.add({
            type: detection.type,
            domain,
            action: 'detected',
            metadata: {
              confidence: detection.confidence,
              pattern: detection.patternName,
              source: 'pattern',
            },
            team_id: teamId,
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
              autoAiEnabled={autoAiScan}
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
              autoAiEnabled={autoAiScan}
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
              autoAiEnabled={autoAiScan}
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
              autoAiEnabled={autoAiScan}
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

    // Filter detections based on expected input type
    const filterExpectedDetections = (
      detections: DetectionResult[],
      expectedTypes: Set<string>
    ): DetectionResult[] => {
      if (expectedTypes.size === 0) return detections;

      // Filter out detections that match the expected input type
      return detections.filter(d => !expectedTypes.has(d.type));
    };

    // Helper function to deduplicate detections based on value and position
    // Prefers pattern detections over AI/local detections
    const deduplicateDetections = (
      patternDetections: DetectionResult[],
      aiDetections: any[] | null
    ): { patternDetections: DetectionResult[]; aiDetections: any[] | null } => {
      if (!aiDetections || aiDetections.length === 0) {
        return { patternDetections, aiDetections };
      }

      // Create a set of pattern detection keys (value:start:end)
      const patternKeys = new Set<string>();
      patternDetections.forEach(d => {
        const key = `${d.value}:${d.start}:${d.end}`;
        patternKeys.add(key);
        // Also add keys for same value at any position to catch overlaps
        patternKeys.add(`${d.value}:*:*`);
      });

      // Filter AI detections to remove those already detected by patterns
      const filteredAiDetections = aiDetections.filter((aiDetection: any) => {
        const value = aiDetection.value || '';
        const key = `${value}:*:*`; // Check if value was detected by patterns

        // Check if this value is already in pattern detections
        const isDuplicate = patternDetections.some(
          patternDet => patternDet.value === value
        );

        return !isDuplicate;
      });

      return {
        patternDetections,
        aiDetections:
          filteredAiDetections.length > 0 ? filteredAiDetections : null,
      };
    };

    // Debounced scan with AI scan and optimization
    const debouncedScan = debounce(async (text: string, input: HTMLElement) => {
      const expectedTypes = getExpectedInputType(
        input as HTMLInputElement | HTMLTextAreaElement
      );
      const skipAi = shouldSkipAiForInput(
        input as HTMLInputElement | HTMLTextAreaElement
      );

      if (expectedTypes.size > 0) {
      }

      const results = detectPii(text);
      const filteredResults = filterExpectedDetections(results, expectedTypes);

      let aiDetections: any[] | null = null;
      if (autoAiScan && !skipAi && aiScanOptimizer.shouldScan(text)) {
        // performAiScan will handle caching internally
        aiDetections = await performAiScan(input, text, filteredResults);
      } else {
        if (!autoAiScan) {
        } else if (skipAi) {
        } else if (!aiScanOptimizer.shouldScan(text)) {
        }
      }

      handleDetection(filteredResults, aiDetections);
    }, 800);

    // Manual rescan function for context menu
    const manualRescan = async () => {
      if (!contextMenuInput) return;

      const expectedTypes = getExpectedInputType(contextMenuInput);
      const skipAi = shouldSkipAiForInput(contextMenuInput);
      const currentValue = getInputValue(contextMenuInput);
      const results = detectPii(currentValue);
      const filteredResults = filterExpectedDetections(results, expectedTypes);

      // Force AI scan (clear cache first to ensure fresh scan)
      let aiDetections: any[] | null = null;
      if (autoAiScan && !skipAi && shouldScanText(currentValue)) {
        // Clear cache for this specific text to force a fresh scan
        aiScanOptimizer.clearCache();
        aiDetections = await performAiScan(
          contextMenuInput,
          currentValue,
          filteredResults
        );
      }

      handleDetection(filteredResults, aiDetections);

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
      input.addEventListener('paste', () => {
        // Wait for pasted content to be inserted, then trigger immediate scan
        setTimeout(async () => {
          if (activeInput !== input) return;

          const expectedTypes = getExpectedInputType(
            input as HTMLInputElement | HTMLTextAreaElement
          );
          const skipAi = shouldSkipAiForInput(
            input as HTMLInputElement | HTMLTextAreaElement
          );

          const currentValue = getInputValue(input);

          const results = detectPii(currentValue);
          const filteredResults = filterExpectedDetections(
            results,
            expectedTypes
          );

          let aiDetections: any[] | null = null;
          if (
            autoAiScan &&
            !skipAi &&
            aiScanOptimizer.shouldScan(currentValue)
          ) {
            aiDetections = await performAiScan(
              input,
              currentValue,
              filteredResults
            );
          }
          handleDetection(filteredResults, aiDetections);
        }, 0);
      });

      if (input.getAttribute('contenteditable') === 'true') {
        input.addEventListener('keyup', handler);
      }
    };

    // Context menu setup
    document.addEventListener('contextmenu', event => {
      const target = event.target as HTMLElement;

      if (isValidInput(target)) {
        contextMenuInput = target as HTMLInputElement | HTMLTextAreaElement;
      } else {
        contextMenuInput = null;
      }
    });

    // Listen for context menu action from background script
    browser.runtime.onMessage.addListener(message => {
      if (message.action === 'rescanForPii') {
        manualRescan();
      }
    });

    document.addEventListener(
      'focusin',
      async event => {
        const target = event.target as HTMLElement;

        if (!isValidInput(target)) return;

        const inputName =
          (target as HTMLInputElement).name ||
          (target as HTMLInputElement).id ||
          'unnamed';

        removeAllIndicators();

        activeInput = target as HTMLInputElement | HTMLTextAreaElement;
        const expectedTypes = getExpectedInputType(activeInput);
        const skipAi = shouldSkipAiForInput(activeInput);

        const currentValue = getInputValue(activeInput);
        const results = detectPii(currentValue);
        const filteredResults = filterExpectedDetections(
          results,
          expectedTypes
        );

        let aiDetections: any[] | null = null;
        if (autoAiScan && !skipAi && aiScanOptimizer.shouldScan(currentValue)) {
          aiDetections = await performAiScan(
            activeInput,
            currentValue,
            filteredResults
          );
        } else if (skipAi) {
        }

        handleDetection(filteredResults, aiDetections);

        attachInputListener(activeInput);
      },
      true
    );

    document.addEventListener(
      'focusout',
      event => {
        const relatedTarget = event.relatedTarget as Node;

        if (
          badgeContainer?.contains(relatedTarget) ||
          dotContainer?.contains(relatedTarget) ||
          isPopupOpen
        ) {
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
        if (badgeRoot && activeInput) {
          const expectedTypes = getExpectedInputType(activeInput);
          const currentValue = getInputValue(activeInput);
          const results = detectPii(currentValue);
          const filteredResults = filterExpectedDetections(
            results,
            expectedTypes
          );

          badgeRoot.render(
            <SimpleWarningBadge
              detections={filteredResults}
              onAnonymize={handleAnonymize}
              onPopupStateChange={isOpen => {
                isPopupOpen = isOpen;
              }}
              variant="full"
              autoAiEnabled={autoAiScan}
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
          return;
        }

        const apiClient = initializeApiClient(token);

        try {
          // Fetch user's personal patterns
          const personalPatterns = await apiClient.getPatterns();

          // Fetch patterns from all teams the user is part of
          const teams = await apiClient.getTeams();
          const teamPoliciesPromises = teams.map(team =>
            apiClient.getTeamPolicies(team.id)
          );
          const teamPoliciesArrays = await Promise.all(teamPoliciesPromises);

          // Extract patterns from all team policies
          const allTeamPatterns: any[] = [];
          teamPoliciesArrays.flat().forEach(policy => {
            if (policy.enabled && policy.policy_data) {
              const policyData =
                typeof policy.policy_data === 'string'
                  ? JSON.parse(policy.policy_data)
                  : policy.policy_data;

              if (policyData.patterns && Array.isArray(policyData.patterns)) {
                policyData.patterns.forEach((pattern: any) => {
                  // Convert team policy pattern format to CustomPattern format
                  allTeamPatterns.push({
                    id: pattern.id,
                    name: pattern.name,
                    pattern: pattern.pattern,
                    pattern_type: pattern.pattern_type,
                    description: pattern.description || '',
                    is_active: true,
                    user_id: '', // Team patterns don't have a specific user
                    created_at: policy.created_at,
                    updated_at: policy.updated_at,
                  });
                });
              }
            }
          });

          // Merge personal and team patterns
          const allPatterns = [...personalPatterns, ...allTeamPatterns];

          // Remove duplicates based on pattern ID (prefer personal patterns)
          const uniquePatterns = Array.from(
            new Map(allPatterns.map(p => [p.id, p])).values()
          );

          if (uniquePatterns && uniquePatterns.length > 0) {
            setCustomPatterns(uniquePatterns);
          }
        } catch (apiError) {
          console.error('Failed to fetch patterns from API:', apiError);
        }
      } catch (error) {
        console.error('Failed to load custom patterns:', error);
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
            // Re-initialize team policies when auth changes
            initializeWithTeamPolicies();
          }
        }
        if (changes.currentTeamId) {
          // Re-initialize team policies when team changes
          initializeWithTeamPolicies();
        }
        if (changes.autoAiScan) {
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
