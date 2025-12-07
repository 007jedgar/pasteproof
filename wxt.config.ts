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
    // Required by Firefox Add-on Store to document what data is collected
    ...(browser === 'firefox'
      ? {
          data_collection_permissions: [
            'Text content from input fields (optional, for AI analysis when premium features enabled)',
            'Domain/hostname information where detections occur (for analytics and context)',
            'Detection metadata (PII type, action taken) for analytics and team reporting',
            'User authentication data stored locally for API access and preferences',
          ],
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
