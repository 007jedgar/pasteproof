import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: ({ browser }) => ({
    name: 'PasteProof',
    description:
      'Your pasteboard bodyguard. Prevents you from pasting sensitive data into the wrong fields.',
    version: '0.1.8',
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
              'https://*.pasteproof.com/*',
              'http://localhost:*/*',
              'https://*.vercel.app/*',
            ],
          },
        }
      : {}),
    host_permissions: [
      '<all_urls>', // Allows content scripts to run on all websites
    ],
    // Firefox uses browser_action in MV2, action in MV3
    action: {
      default_title: 'Paste Proof',
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
