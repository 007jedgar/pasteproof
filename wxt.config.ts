import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'PasteProof',
    description:
      'Your pasteboard bodyguard. Prevents you from pasting sensitive data into the wrong fields.',
    version: '0.1.0',
    permissions: [
      'storage', // For storing user settings
      'activeTab', // Required for some interactions
    ],
    externally_connectable: {
      matches: [
        "https://pasteproof.com/*",
        "https://*.pasteproof.com/*",
        "http://localhost:*/*",
        "https://*.vercel.app/*"
      ]
    },
    host_permissions: [
      '<all_urls>', // Allows content scripts to run on all websites
    ],
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
  },
});
