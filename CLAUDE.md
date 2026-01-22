# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PasteProof is a privacy-first browser extension that detects sensitive data (PII) in real-time as users type in input fields. It's built with the WXT framework for cross-browser compatibility (Chrome, Firefox, Edge, Brave).

## Common Commands

```bash
# Development
pnpm dev              # Start dev server for Chrome (port 3001)
pnpm dev:firefox      # Start dev server for Firefox

# Build
pnpm build            # Production build for Chrome
pnpm build:firefox    # Production build for Firefox

# Testing
pnpm test             # Run Vitest tests
pnpm test -- --run    # Run tests once (no watch mode)
pnpm test -- src/shared/pii-detector.test.ts  # Run specific test file

# Code Quality
pnpm compile          # TypeScript type checking
pnpm format           # Format code with Prettier
pnpm check            # Check formatting without modifying

# Packaging
pnpm zip              # Create Chrome Web Store zip
pnpm zip:firefox      # Create Firefox Add-ons zip
```

## Architecture

### Entry Points (`src/entrypoints/`)

- **content.tsx**: Content script injected into all web pages. Handles:
  - Input field detection and focus/blur events
  - Debounced PII scanning (800ms delay)
  - Warning badge rendering via React portals
  - AI scan triggering and caching
  - Auth token handling from pasteproof.com

- **background.ts**: Service worker that manages:
  - Detection queue with batched API logging
  - Context menu ("Rescan for PII")
  - External message origin validation

- **popup/**: Extension popup UI (React + MUI)

### Shared Modules (`src/shared/`)

- **pii-detector.ts**: Core detection engine with:
  - Built-in regex patterns (credit cards with Luhn validation, SSN, email, phone, API keys, HIPAA/PCI/GDPR patterns)
  - Custom pattern support (fetched from API)
  - JSON-specific suspicious ID detection

- **api-client.ts**: API client singleton with:
  - Endpoint/ID/domain validation to prevent injection
  - AI context analysis, whitelist, team policies, audit logs
  - Base URL from `VITE_SELF_HOSTED_API_URL` or defaults to production

- **ai-scan-optimizer.ts**: Caches AI scan results to reduce API calls

- **components/SimpleWarningBadge.tsx**: Warning indicator with:
  - Two variants: `full` (badge with count) and `dot` (minimal indicator)
  - Pattern Match and AI Scan tabs
  - Anonymization actions per-item or all at once
  - Dynamic positioning (above/below input based on viewport)

### Configuration

- **wxt.config.ts**: WXT/manifest configuration with browser-specific settings (externally_connectable for Chrome, data_collection_permissions for Firefox)
- **vitest.config.ts**: Test config using jsdom environment with WxtVitest plugin

## Key Patterns

### Detection Flow
1. User focuses input → `focusin` event
2. Pattern detection runs immediately (`detectPii()`)
3. If autoAiScan enabled, AI scan runs after debounce
4. Results merged and displayed in `SimpleWarningBadge`
5. AI results cached by `aiScanOptimizer`

### Smart Input Detection
Inputs are analyzed for expected data types (email, phone, password, etc.) based on attributes, labels, and autocomplete values. Detections matching the expected type are filtered out.

### Browser Compatibility
- Use `browser.*` APIs (WXT polyfills to work on both Chrome and Firefox)
- Chrome-specific: `chrome.runtime.onSuspend`, `externally_connectable`
- Firefox-specific: MV2/MV3 manifest differences, scripting permission

### Storage
- Extension storage: `storage.getItem('local:key')` / `storage.setItem()`
- Used for: authToken, user, enabled, autoAiScan, currentTeamId

## API Reference

See [API_REFERENCE.md](./API_REFERENCE.md) for full endpoint documentation.

**Key endpoints used by extension:**
- `/v1/whitelist/*` - Domain whitelist management
- `/v1/patterns/*` - Custom detection patterns
- `/v1/analyze-context` - AI-powered PII analysis (premium)
- `/v1/detections/batch` - Batch detection logging
- `/v1/teams/:id/policies` - Team policy patterns

## Environment Variables

```bash
VITE_SELF_HOSTED_API_URL  # Optional: self-hosted backend URL
VITE_API_URL              # API base URL
VITE_WEB_URL              # Web app URL for auth redirects
```

## Output Directories

- `.output/chrome-mv3/` - Chrome development build
- `.output/firefox-mv2/` - Firefox development build
