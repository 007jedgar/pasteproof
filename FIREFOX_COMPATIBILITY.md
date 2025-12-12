# Firefox Compatibility Guide

## Overview

PasteProof has been updated to support both Chrome and Firefox browsers. This document outlines the changes made for Firefox compatibility and how to build/test for Firefox.

## Changes Made for Firefox Compatibility

### 1. **wxt.config.ts**

- Made the manifest configuration dynamic using `({ browser }) => ({})`
- Conditionally added `scripting` permission for Firefox
- Removed Chrome-specific `externally_connectable` for Firefox builds (Chrome-only feature)
- The extension now generates browser-specific manifests automatically

### 2. **src/entrypoints/popup/App.tsx**

- Added error handling for `browser.scripting.executeScript` API
- Added Firefox-specific comments for scripting API usage
- The scripting API works in both browsers with proper permissions

### 3. **src/entrypoints/background.ts**

- Removed Chrome-specific `/*global chrome*/` comment
- Added conditional check for `chrome.runtime.onSuspend` (Chrome-specific lifecycle event)
- Firefox uses different lifecycle events, so the suspend listener is optional

### 4. **Browser API Usage**

All files already use the `browser` namespace (WebExtensions API) which is supported by both Chrome and Firefox:

- ✅ `browser.tabs.*`
- ✅ `browser.storage.*`
- ✅ `browser.runtime.*`
- ✅ `browser.contextMenus.*`
- ✅ `browser.scripting.*` (with proper permissions)

## Building for Firefox

### Development Mode

```bash
npm run dev:firefox
```

This starts the development server with Firefox-specific configuration and opens the extension in Firefox Developer Edition.

### Production Build

```bash
npm run build:firefox
```

This creates a production build optimized for Firefox in the `.output/firefox-mv2` or `.output/firefox-mv3` directory (depending on manifest version).

### Create Distributable Package

```bash
npm run zip:firefox
```

This creates a `.zip` file ready for submission to Firefox Add-ons (AMO).

## Building for Chrome

The extension continues to work with Chrome using the standard commands:

```bash
npm run dev      # Development mode for Chrome
npm run build    # Production build for Chrome
npm run zip      # Create Chrome Web Store package
```

## Key Differences Between Chrome and Firefox

### 1. **Manifest Keys**

- `externally_connectable`: Chrome-only (not included in Firefox builds)
- `scripting` permission: Explicitly required in Firefox, implicit in Chrome

### 2. **API Behavior**

- Both browsers support the `browser.*` namespace
- Chrome also supports `chrome.*` namespace (callback-based)
- Firefox's `browser.*` API is Promise-based (more modern)

### 3. **Extension IDs**

- Chrome: Auto-generated based on extension key
- Firefox: Specified in `browser_specific_settings` (optional but recommended for AMO)

### 4. **Lifecycle Events**

- `chrome.runtime.onSuspend`: Chrome-only, not available in Firefox
- Both support `onInstalled`, `onStartup`, `onMessage`, etc.

## Testing

### Manual Testing

1. Build the extension for Firefox: `npm run build:firefox`
2. Open Firefox
3. Navigate to `about:debugging`
4. Click "This Firefox" → "Load Temporary Add-on"
5. Select the `manifest.json` from `.output/firefox-mv2/` directory
6. Test all functionality:
   - Sign in/out
   - Enable/disable protection
   - PII detection on various websites
   - Context menu "Rescan for PII"
   - Auto AI scan toggle
   - Team switching

### Development Testing

1. Run `npm run dev:firefox`
2. The extension will auto-reload on file changes
3. Check the terminal for any build errors
4. Check the browser console for runtime errors

## Known Limitations

### Firefox-Specific

- `externally_connectable` is not supported, but the extension uses alternative methods for auth communication
- Some lifecycle events like `onSuspend` are Chrome-specific

### Both Browsers

- Content Security Policy (CSP) restrictions on some websites
- Some websites may have strict iframe/popup restrictions

## Debugging

### Firefox Developer Tools

1. Open `about:debugging#/runtime/this-firefox`
2. Find "PasteProof" in the extensions list
3. Click "Inspect" to open DevTools for the background script
4. Click "Debug" for the popup

### Console Logging

The extension includes comprehensive logging:

- Background script logs: Check the extension debugger
- Content script logs: Check the page's console
- Popup logs: Check the popup's console (right-click popup → Inspect)

## Support

For Firefox-specific issues:

- Check the [Firefox Extension Workshop](https://extensionworkshop.com/)
- Review [browser support for WebExtensions APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Browser_support_for_JavaScript_APIs)
- File issues on the project repository with `[Firefox]` prefix

## Version History

### v0.1.6

- ✅ Added full Firefox support
- ✅ Conditional manifest generation for different browsers
- ✅ Fixed Chrome-specific API usage
- ✅ Added Firefox-specific permissions
- ✅ Improved error handling for cross-browser compatibility
