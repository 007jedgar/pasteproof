import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: ({ browser }) => ({
    name: 'PasteProof',
    description:
      'Your pasteboard bodyguard. Prevents you from pasting sensitive data into the wrong fields.',
    version: '0.1.9',
    permissions: [
      'storage', // For storing user settings
      'activeTab', // Required for some interactions
      'contextMenus',
      ...(browser === 'firefox' ? ['scripting'] : []), // Firefox needs explicit scripting permission
    ],
    // externally_connectable is Chrome-only, so we conditionally add it
    ...(browser === 'chrome' || browser === 'edge'
      ? {
          externally_connectable: {
            matches: [
              'https://pasteproof.com/*',
              'https://*.pasteproof.com/*', // Allows api.pasteproof.com, www.pasteproof.com, etc.
              'http://localhost:*/*',
              'http://127.0.0.1:*/*',
              'https://*.vercel.app/*',
            ],
          },
        }
      : {}),
    host_permissions: [
      '<all_urls>', // Allows content scripts to run on all websites
    ],
    // Firefox-specific: Declare data collection practices
    // Required by Firefox Add-on Store - must be under browser_specific_settings.gecko
    // See: https://blog.mozilla.org/addons/2025/05/09/new-extension-data-consent-experience-now-available-in-firefox-nightly/
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: {
                // Required data: none - extension works without any data collection (local pattern matching)
                required: [],
                // Optional data: all features that require server communication are optional
                optional: [
                  'websiteContent', // Text content from input fields for AI analysis (premium feature)
                  'browsingActivity', // Domain/hostname where detections occur (for analytics)
                  'websiteActivity', // Detection metadata (PII type, actions taken) for analytics
                  'authenticationInfo', // Auth tokens for premium features and API access
                  'technicalAndInteraction', // Extension usage, settings, error reports
                ],
              },
            },
          },
        }
      : {}),
    // Firefox uses browser_action in MV2, action in MV3
    action: {
      default_title: 'PasteProof',
      default_popup: 'entrypoints/popup/index.html',
    },
    icons: {
      '16': 'assets/icons/pasteproof-16.png',
      '48': 'assets/icons/pasteproof-48.png',
      '128': 'assets/icons/pasteproof-128.png',
      '500': 'assets/icons/pasteproof-500.png',
    },
  }),
});
