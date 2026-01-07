export type PiiType =
  | 'CREDIT_CARD'
  | 'SSN'
  | 'EMAIL'
  | 'PHONE'
  | 'API_KEY'
  | 'AWS_KEY'
  | 'PRIVATE_KEY'
  | 'IP_ADDRESS'
  | 'HIPAA_MRN'
  | 'HIPAA_ACCOUNT'
  | 'HIPAA_DOB'
  | 'PCI_CVV'
  | 'PCI_PAN'
  | 'PCI_TRACK'
  | 'PCI_EXPIRY'
  | 'GDPR_PASSPORT'
  | 'GDPR_NIN'
  | 'GDPR_IBAN'
  | 'SUSPICIOUS_ID' // For suspicious numeric IDs found in JSON
  | 'CUSTOM'; // For user-defined patterns

export type DetectionResult = {
  type: PiiType | string;
  value: string;
  start?: number;
  end?: number;
  confidence?: number;
  patternName?: string;
};

export type CustomPattern = {
  id: string;
  name: string;
  pattern: string;
  pattern_type: string;
  description?: string;
  is_active: boolean | number | string;
};

// Built-in patterns
const BUILT_IN_PATTERNS: Array<{
  type: PiiType;
  regex: RegExp;
  validate?: (value: string) => boolean;
}> = [
  {
    type: 'CREDIT_CARD',
    // Match card numbers with optional spaces/dashes: allows formats like:
    // 4242424242424242, 4242 4242 4242 4242, 4242-4242-4242-4242
    // Matches 13-19 digits with card type prefixes (Visa 4xxx, Mastercard 5[1-5]xxx, Amex 3[47]xxx, etc.)
    regex:
      /\b(?:(?:4\d{3}[-\s]?){3}\d{1,4}|(?:5[1-5]\d{2}[-\s]?)(?:\d{4}[-\s]?){3}\d{4}|(?:3[47]\d{2}[-\s]?)(?:\d{4}[-\s]?){2}\d{4}|(?:3[0-9]\d{2}[-\s]?)(?:\d{4}[-\s]?){2}\d{3}|(?:6(?:011|5[0-9]{2})[-\s]?)(?:\d{4}[-\s]?){3}\d{4})\b/g,
    validate: luhnCheck,
  },
  {
    type: 'SSN',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: 'EMAIL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  },
  {
    type: 'PHONE',
    regex: /\b(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  },
  {
    type: 'API_KEY',
    regex: /(?:api[_-]?key|apikey)["\s:=]+["']?([a-zA-Z0-9_\-]{20,})["']?/gi,
  },
  {
    type: 'AWS_KEY',
    regex: /AKIA[0-9A-Z]{16}/g,
  },
  {
    type: 'PRIVATE_KEY',
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[A-Za-z0-9+\/=\s\n\r]+-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/gs,
  },
  {
    type: 'IP_ADDRESS',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  },
  // HIPAA patterns
  {
    type: 'HIPAA_MRN',
    regex: /\bMRN[-\s]?\d{6,12}\b/gi,
  },
  {
    type: 'HIPAA_ACCOUNT',
    regex: /\bAccount[-\s]?(?:Number|#)?[-\s]?\d{6,12}\b/gi,
  },
  {
    type: 'HIPAA_DOB',
    regex: /\b(?:DOB|Date of Birth)[-\s:]?\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
  },
  // PCI-DSS patterns
  {
    type: 'PCI_CVV',
    regex:
      /\b(?:CVV|CVC|Card Verification)[-\s]?(?:Value|Code)?[-\s]?\d{3,4}\b/gi,
  },
  {
    type: 'PCI_PAN',
    regex: /\b(?:PAN|Primary Account Number)[-\s]?\d{13,19}\b/gi,
  },
  {
    type: 'PCI_TRACK',
    regex: /\b%?[A-Z]\d{13,19}=[\d?]{4,}\b/g,
  },
  {
    type: 'PCI_EXPIRY',
    regex: /\b(?:Exp|Expiry|Expiration)[-\s:]?\d{1,2}[/-]\d{2,4}\b/gi,
  },
  // GDPR patterns
  {
    type: 'GDPR_PASSPORT',
    regex: /\b(?:Passport|Passport Number|Passport #)[-\s:]?[A-Z0-9]{6,9}\b/gi,
  },
  {
    type: 'GDPR_NIN',
    regex: /\b(?:NI|NINO|National Insurance)[-\s]?[A-Z]{2}\d{6}[A-Z]\b/gi,
  },
  {
    type: 'GDPR_IBAN',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,
  },
];

// Store custom patterns (fetched from API)
let customPatterns: CustomPattern[] = [];

// Luhn algorithm for credit card validation
function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i]);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

// Helper function to detect what PII type a value might be
// This helps normalize custom pattern types to match known PII types
function detectPiiType(value: string): PiiType | null {
  // Check SSN pattern
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(value)) {
    return 'SSN';
  }
  // Check email pattern
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(value)) {
    return 'EMAIL';
  }
  // Check phone pattern
  if (/\b(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(value)) {
    return 'PHONE';
  }
  // Check credit card pattern (with validation)
  if (
    /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/.test(
      value
    ) &&
    luhnCheck(value)
  ) {
    return 'CREDIT_CARD';
  }
  // Check AWS key
  if (/AKIA[0-9A-Z]{16}/.test(value)) {
    return 'AWS_KEY';
  }
  // Check private key
  if (
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[A-Za-z0-9+\/=\s\n\r]+-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/gs.test(
      value
    )
  ) {
    return 'PRIVATE_KEY';
  }
  return null;
}

// Set custom patterns (called after fetching from API)
export function setCustomPatterns(patterns: CustomPattern[]) {
  customPatterns = patterns.filter(p => {
    // Handle various types that might come from API (boolean, number, string)
    const isActive = p.is_active;
    if (typeof isActive === 'boolean') {
      return isActive;
    }
    if (typeof isActive === 'number') {
      return isActive === 1;
    }
    if (typeof isActive === 'string') {
      return isActive === '1' || isActive.toLowerCase() === 'true';
    }
    return false;
  });

  // Test each pattern
  customPatterns.forEach(p => {
    try {
      const regex = new RegExp(p.pattern, 'gi');
      const testResult = regex.test('EMP-123456');
    } catch (e) {
      console.error(`❌ Pattern "${p.name}" regex error:`, e);
    }
  });
}

/**
 * Detect if the input contains JSON data
 */
function isJsonContent(text: string): boolean {
  // Trim whitespace
  const trimmed = text.trim();

  // Check for JSON object/array structure
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // Still might be JSON-like even if not perfectly valid
      // Check for common JSON patterns
      return /[{[][\s\S]*["'][\w_-]+["'][\s\S]*:/.test(trimmed);
    }
  }

  // Check if text contains JSON-like structures embedded within
  // Look for patterns like: "key": "value" or 'key': 'value'
  const hasJsonPattern = /["'][\w_-]+["']\s*:\s*["'\[{]/.test(text);
  if (hasJsonPattern) {
    // Count braces to see if there's enough structure
    const openBraces = (text.match(/[{[]/g) || []).length;
    const closeBraces = (text.match(/[}\]]/g) || []).length;
    return openBraces >= 2 && closeBraces >= 2;
  }

  return false;
}

/**
 * Extract suspicious numeric IDs from JSON content
 * Flags strings with 8+ numbers that contain dashes, hyphens, or periods
 * Does not flag numbers with $ prefix (currency)
 */
function detectSuspiciousIdsInJson(text: string): DetectionResult[] {
  if (!isJsonContent(text)) {
    return [];
  }

  const results: DetectionResult[] = [];

  // Pattern to match suspicious IDs:
  // - Must have at least 8 digits total
  // - Can contain dashes, hyphens, or periods between/around digits
  // - Must NOT be preceded by $ (currency)
  // - Liberal matching for various ID formats

  // Regex breakdown:
  // (?<!\$)              - Negative lookbehind: not preceded by $
  // (?<!\w)              - Not preceded by word character (ensures word boundary)
  // (\d+[-.\s]*){2,}     - Two or more groups of digits separated by dash/period/space
  // \d+                  - Ending with digits
  // (?!\w)               - Not followed by word character

  const suspiciousIdPattern =
    /(?<!\$)(?<!\w)(\d+[-.\s]+\d+(?:[-.\s]+\d+)*?)(?!\w)/g;

  const matches = text.matchAll(suspiciousIdPattern);

  for (const match of matches) {
    const value = match[0].trim();
    const start = match.index;

    // Count total number of digits in the match
    const digitCount = (value.match(/\d/g) || []).length;

    // Only flag if it has 8 or more digits
    if (digitCount >= 8) {
      // Check if this looks like a known pattern first
      const alreadyDetectedType = detectPiiType(value);

      // Skip if it's already detected as a known PII type
      if (!alreadyDetectedType) {
        results.push({
          type: 'SUSPICIOUS_ID',
          value,
          start,
          end: start !== undefined ? start + value.length : undefined,
          confidence: 0.7,
        });
      }
    }
  }

  // Also detect pure numeric strings of 8+ digits in JSON values
  // Pattern: look for long numeric strings in quotes (JSON string values)
  const jsonValuePattern = /["'](\d{8,})["']/g;
  const valueMatches = text.matchAll(jsonValuePattern);

  for (const match of valueMatches) {
    const value = match[1]; // The captured numeric string
    const start = match.index !== undefined ? match.index + 1 : undefined; // +1 to skip opening quote

    // Check if already detected
    const alreadyDetected = results.some(
      r => r.value === value && r.start === start
    );

    if (!alreadyDetected) {
      // Check if it's a known PII type
      const knownType = detectPiiType(value);

      if (!knownType) {
        results.push({
          type: 'SUSPICIOUS_ID',
          value,
          start,
          end: start !== undefined ? start + value.length : undefined,
          confidence: 0.7,
        });
      }
    }
  }

  return results;
}

// Main detection function
export function detectPii(text: string): DetectionResult[] {
  if (!text || text.length === 0) return [];

  const results: DetectionResult[] = [];
  const builtInResults: DetectionResult[] = [];

  // Check built-in patterns first (these take priority)
  for (const pattern of BUILT_IN_PATTERNS) {
    const matches = text.matchAll(pattern.regex);

    for (const match of matches) {
      const value = match[0];

      // Skip if validation function exists and fails
      if (pattern.validate && !pattern.validate(value)) {
        continue;
      }

      const detection: DetectionResult = {
        type: pattern.type,
        value,
        start: match.index,
        end: match.index ? match.index + value.length : undefined,
      };

      builtInResults.push(detection);
      results.push(detection);
    }
  }

  // Check for suspicious IDs in JSON content
  const jsonSuspiciousIds = detectSuspiciousIdsInJson(text);
  for (const detection of jsonSuspiciousIds) {
    // Check if not already detected by built-in patterns
    const alreadyDetected = builtInResults.some(
      builtIn =>
        builtIn.value === detection.value &&
        builtIn.start === detection.start &&
        builtIn.end === detection.end
    );

    if (!alreadyDetected) {
      results.push(detection);
    }
  }

  // Check custom patterns (only add if not already detected by built-in patterns)
  for (const customPattern of customPatterns) {
    try {
      const regex = new RegExp(customPattern.pattern, 'gi');
      const matches = text.matchAll(regex);

      for (const match of matches) {
        const value = match[0];
        const start = match.index;
        const end = start !== undefined ? start + value.length : undefined;

        // Check if this value at this position is already detected by a built-in pattern
        const alreadyDetected = builtInResults.some(
          builtIn =>
            builtIn.value === value &&
            builtIn.start === start &&
            builtIn.end === end
        );

        if (alreadyDetected) {
          // Skip this custom pattern detection since built-in already detected it
          continue;
        }

        // Normalize the type - try to detect what PII type this is
        let normalizedType = customPattern.pattern_type;
        const detectedType = detectPiiType(value);
        if (detectedType) {
          // Use the detected type instead of generic CUSTOM/REGEX
          normalizedType = detectedType;
        } else if (
          normalizedType === 'CUSTOM' ||
          normalizedType === 'REGEX' ||
          !normalizedType
        ) {
          // If pattern_type is generic, keep it as CUSTOM
          normalizedType = 'CUSTOM';
        }

        results.push({
          type: normalizedType,
          value,
          start,
          end,
          confidence: 0.9,
          patternName: customPattern.name,
        });
      }
    } catch (error) {
      console.error(`Invalid custom pattern: ${customPattern.name}`, error);
    }
  }

  // Remove duplicates based on value and position (start/end)
  // Prefer built-in detections over custom ones
  const uniqueResults: DetectionResult[] = [];
  const seen = new Set<string>();

  // Helper to check if a result matches a built-in detection
  const isBuiltInDetection = (result: DetectionResult): boolean => {
    return builtInResults.some(
      builtIn =>
        builtIn.value === result.value &&
        builtIn.start === result.start &&
        builtIn.end === result.end &&
        builtIn.type === result.type
    );
  };

  // First, add all built-in detections (deduplicated by value+position)
  for (const result of results) {
    if (isBuiltInDetection(result)) {
      const key = `${result.value}:${result.start}:${result.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(result);
      }
    }
  }

  // Then add custom detections that don't overlap with built-in ones
  for (const result of results) {
    if (!isBuiltInDetection(result)) {
      const key = `${result.value}:${result.start}:${result.end}`;
      // Check if this value at this position was already detected by a built-in pattern
      const isDuplicate = builtInResults.some(
        builtIn =>
          builtIn.value === result.value &&
          builtIn.start === result.start &&
          builtIn.end === result.end
      );

      if (!isDuplicate && !seen.has(key)) {
        seen.add(key);
        uniqueResults.push(result);
      }
    }
  }

  return uniqueResults;
}
