# Smart Input Detection

## Overview

PasteProof now includes **Smart Input Detection** that intelligently recognizes when an input field is designed for specific types of sensitive data and adjusts its detection behavior accordingly.

## The Problem

Before this feature, PasteProof would warn users about PII in **all** situations, even when they were **supposed** to enter that data. For example:

- Entering your email in an "Email" field → ⚠️ Warning (unnecessary)
- Entering your phone number in a "Phone Number" field → ⚠️ Warning (unnecessary)
- Entering a password in a "Password" field → ⚠️ Warning (unnecessary)

These warnings created notification fatigue and reduced the extension's usefulness.

## The Solution

PasteProof now analyzes input field attributes to determine **what type of data is expected** and:

1. **Skips AI scanning** for inputs designed for sensitive data
2. **Filters pattern-based detections** to hide expected data types

### Example Scenarios

#### ✅ Expected Data (No Warning)
```html
<!-- Email field -->
<input type="email" name="user_email" placeholder="Enter your email">
User enters: john@example.com
Result: ✅ No warning (email is expected)

<!-- Phone field -->
<input type="tel" name="phone" placeholder="Phone number">
User enters: (555) 123-4567
Result: ✅ No warning (phone is expected)

<!-- Password field -->
<input type="password" name="password">
User enters: myP@ssw0rd123
Result: ✅ No warning (password is expected)
```

#### ⚠️ Unexpected Data (Warning Shown)
```html
<!-- Comment field -->
<textarea name="comment" placeholder="Leave a comment">
User enters: Contact me at john@example.com or (555) 123-4567
Result: ⚠️ Warning (email and phone NOT expected in comment)

<!-- Username field -->
<input type="text" name="username" placeholder="Choose a username">
User enters: john.doe@company.com
Result: ⚠️ Warning (email NOT expected in username)
```

## How It Works

### 1. Input Analysis

The extension examines multiple attributes to determine expected data type:

```javascript
// Analyzed attributes:
- input.type (e.g., "email", "tel", "password")
- input.name (e.g., "email", "phone_number", "ssn")
- input.id (e.g., "user-email", "mobile-phone")
- input.placeholder (e.g., "Enter your email")
- input.autocomplete (e.g., "email", "tel", "cc-number")
- input.ariaLabel / aria-label
- input.title
- Associated <label> element text
```

### 2. Pattern Matching

The system looks for keywords indicating expected data types:

| Data Type | Keywords Detected |
|-----------|-------------------|
| **EMAIL** | `email`, `e-mail`, `mail` |
| **PHONE** | `phone`, `telephone`, `mobile`, `cell`, `fax` |
| **PASSWORD** | `password`, `passwd`, `pwd` |
| **SSN** | `ssn`, `social security`, `social insurance` |
| **CREDIT_CARD** | `card`, `credit card`, `debit card`, `cc number` |
| **DATE_OF_BIRTH** | `birth date`, `dob`, `date of birth` |

### 3. Smart Filtering

When expected data types are detected:

- **Pattern-based detections** matching the expected type are hidden
- **AI scanning** is completely skipped (saves API calls, improves performance)
- **Unexpected detections** are still shown (e.g., SSN in an email field)

## Technical Implementation

### Key Functions

#### `getExpectedInputType()`
```typescript
const expectedTypes = getExpectedInputType(inputElement);
// Returns: Set<string> (e.g., Set(['EMAIL', 'PHONE']))
```

Analyzes the input and returns a set of expected PII types.

#### `shouldSkipAiForInput()`
```typescript
const skipAi = shouldSkipAiForInput(inputElement);
// Returns: boolean (true if AI scan should be skipped)
```

Determines if AI scanning should be skipped (returns `true` if input expects any sensitive data).

#### `filterExpectedDetections()`
```typescript
const filtered = filterExpectedDetections(detections, expectedTypes);
// Filters out detections that match expected types
```

Removes pattern-based detections that match the input's expected data type.

### Integration Points

Smart detection is applied at all scanning trigger points:

1. **On Focus** - When user focuses an input field
2. **On Input** - As user types (debounced)
3. **On Paste** - When content is pasted
4. **Manual Rescan** - Via context menu
5. **After Anonymization** - When re-scanning post-anonymization

## Benefits

### For Users
- ✅ **Fewer False Positives** - No warnings for legitimate data entry
- ✅ **Better UX** - Extension feels smarter and less intrusive
- ✅ **Faster Performance** - AI scanning skipped when not needed

### For Developers
- ✅ **API Cost Savings** - Fewer unnecessary AI scans
- ✅ **Better Accuracy** - Focus AI on truly suspicious cases
- ✅ **Extensible** - Easy to add more data types and patterns

## Configuration

Currently, smart detection is **always enabled** and requires no configuration. The feature:

- ✅ Works automatically in the background
- ✅ Requires no user settings
- ✅ Compatible with all existing features

## Examples

### Real-World Form Examples

#### Login Form
```html
<form>
  <input type="email" name="email" placeholder="Email">
  <!-- ✅ Email detection skipped -->
  
  <input type="password" name="password" placeholder="Password">
  <!-- ✅ Password detection skipped -->
</form>
```

#### Contact Form
```html
<form>
  <input type="text" name="name" placeholder="Your Name">
  <!-- ⚠️ Will detect any PII entered -->
  
  <input type="email" name="email" placeholder="Email Address">
  <!-- ✅ Email detection skipped -->
  
  <input type="tel" name="phone" placeholder="Phone Number">
  <!-- ✅ Phone detection skipped -->
  
  <textarea name="message" placeholder="Message">
  <!-- ⚠️ Will detect any PII entered -->
</form>
```

#### Payment Form
```html
<form>
  <input type="text" name="cc-number" autocomplete="cc-number" 
         placeholder="Card Number">
  <!-- ✅ Credit card detection skipped -->
  
  <input type="text" name="cc-exp" autocomplete="cc-exp" 
         placeholder="MM/YY">
  <!-- ✅ Expiry detection skipped -->
  
  <input type="text" name="cc-csc" autocomplete="cc-csc" 
         placeholder="CVV">
  <!-- ✅ CVV detection skipped -->
</form>
```

### Edge Cases Handled

#### Multiple Expected Types
```html
<input name="email_or_phone" placeholder="Email or Phone">
<!-- Both EMAIL and PHONE detections filtered -->
```

#### Unexpected Data in Expected Field
```html
<input type="email" name="email">
User enters: "123-45-6789"
<!-- ⚠️ Warning: SSN not expected in email field -->
```

#### Generic Field with Sensitive Data
```html
<input type="text" name="notes">
User enters: "Call me at john@example.com"
<!-- ⚠️ Warning: Email detected in generic notes field -->
```

## Future Enhancements

Potential improvements for future versions:

1. **User Customization** - Allow users to configure sensitivity levels
2. **Machine Learning** - Learn from user dismissals to improve accuracy
3. **More Data Types** - Add support for addresses, driver's licenses, etc.
4. **Confidence Scores** - Show warnings only above certain confidence thresholds
5. **Domain-Specific Rules** - Different behavior for banking vs social sites

## Testing

To test smart detection:

1. Visit any website with forms
2. Test email field: Enter an email → No warning expected
3. Test comment field: Enter email → Warning expected
4. Test phone field: Enter phone → No warning expected
5. Test text field: Enter phone → Warning expected

## Troubleshooting

### "I'm not seeing warnings when I should"

Check if the input field has attributes suggesting it's meant for that data:
- Open DevTools
- Inspect the input element
- Look for `type`, `name`, `placeholder`, `autocomplete` attributes

### "I'm seeing warnings when I shouldn't"

The input field might not have proper semantic attributes. This is a website design issue, not an extension bug. Consider:
- Contacting the website developer
- Using the "Whitelist" feature for trusted sites

## Related Documentation

- [Firefox Compatibility Guide](./FIREFOX_COMPATIBILITY.md)
- [Firefox Migration Summary](./FIREFOX_MIGRATION_SUMMARY.md)
- [Main README](./README.md)

---

**Feature added:** November 22, 2025  
**Extension version:** 0.1.6+  
**Status:** ✅ Production Ready

