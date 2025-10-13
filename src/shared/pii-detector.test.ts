import { describe, it, expect } from 'vitest';
import { detectPii, PiiType } from './pii-detector';

describe('PII Detector', () => {
  it('should detect a valid credit card number', () => {
    const text = 'My card is 3782 8224 6310 005 thanks'; // Valid 15-digit Amex
    const results = detectPii(text);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe(PiiType.CreditCard);
  });

  // Replace the second failing test with this:
  it('should detect multiple PII types in one string', () => {
    // Use a standard, known-valid Luhn number (Stripe's test Visa)
    const text = 'email jdoe@pasteproof.com and use card 4242 4242 4242 4242';
    const results = detectPii(text);
    expect(results).toHaveLength(2);
    expect(results.some(r => r.type === PiiType.Email)).toBe(true);
    expect(results.some(r => r.type === PiiType.CreditCard)).toBe(true);
  });

  it('should NOT detect an invalid credit card number', () => {
    const text = 'Fake card 1234-5678-1234-5678'; // Invalid Luhn
    const results = detectPii(text);
    expect(results).toHaveLength(0);
  });

  it('should detect a valid SSN', () => {
    const text = 'SSN: 555-44-3333';
    const results = detectPii(text);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe(PiiType.SSN);
  });

  it('should detect an email address', () => {
    const text = 'contact me at test@example.com';
    const results = detectPii(text);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe(PiiType.Email);
  });

  it('should detect a US phone number', () => {
    const text = 'call (800) 555-1234 for details';
    const results = detectPii(text);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe(PiiType.PhoneNumber);
  });

  it('should detect a Stripe API key', () => {
    const text = 'the key is sk_live_xxxxxxxxxxxxxxxxxxxxxxxx';
    const results = detectPii(text);
    // It will also detect the email, so we check for the API key specifically
    const apiKeyResult = results.find(r => r.type === PiiType.APIKey);
    expect(apiKeyResult).toBeDefined();
    expect(apiKeyResult?.value).toContain('sk_live');
  });

  it('should return an empty array for clean text', () => {
    const text = 'This is a perfectly safe sentence.';
    const results = detectPii(text);
    expect(results).toHaveLength(0);
  });
});
