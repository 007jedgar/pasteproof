export type PiiType =
  | 'CREDIT_CARD'
  | 'SSN'
  | 'EMAIL'
  | 'PHONE'
  | 'API_KEY'
  | 'IP_ADDRESS'
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
  is_active: boolean;
};

// Built-in patterns
const BUILT_IN_PATTERNS: Array<{
  type: PiiType;
  regex: RegExp;
  validate?: (value: string) => boolean;
}> = [
  {
    type: 'CREDIT_CARD',
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
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
    regex:
      /\b(?:api[_-]?key|token|secret)[_-]?[:\s]*['"]*([a-zA-Z0-9_\-]{20,})['"]*\b/gi,
  },
  {
    type: 'IP_ADDRESS',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
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

// Set custom patterns (called after fetching from API)
export function setCustomPatterns(patterns: CustomPattern[]) {
  customPatterns = patterns.filter(p => {
    const isActive =
      p.is_active === 1 || p.is_active === true || p.is_active === '1';
    return isActive;
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
// Main detection function
export function detectPii(text: string): DetectionResult[] {
  if (!text || text.length === 0) return [];

  const results: DetectionResult[] = [];

  // Check built-in patterns
  for (const pattern of BUILT_IN_PATTERNS) {
    const matches = text.matchAll(pattern.regex);

    for (const match of matches) {
      const value = match[0];

      // Skip if validation function exists and fails
      if (pattern.validate && !pattern.validate(value)) {
        continue;
      }

      results.push({
        type: pattern.type,
        value,
        start: match.index,
        end: match.index ? match.index + value.length : undefined,
      });
    }
  }

  // Check custom patterns
  for (const customPattern of customPatterns) {
    try {
      const regex = new RegExp(customPattern.pattern, 'gi');
      const matches = text.matchAll(regex);

      for (const match of matches) {
        const value = match[0];

        results.push({
          type: customPattern.pattern_type,
          value,
          start: match.index,
          end: match.index ? match.index + value.length : undefined,
          confidence: 0.9,
          patternName: customPattern.name,
        });
      }
    } catch (error) {
      console.error(`Invalid custom pattern: ${customPattern.name}`, error);
    }
  }
  // Remove duplicates (same value and type)
  const uniqueResults = results.filter(
    (result, index, self) =>
      index ===
      self.findIndex(r => r.type === result.type && r.value === result.value)
  );

  return uniqueResults;
}
