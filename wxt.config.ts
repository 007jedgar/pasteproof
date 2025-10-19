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
    host_permissions: [
      'http://localhost:8787/*',
      'http://localhost:3000/*',
      'https://pasteproof-web.vercel.app',
      'https://pasteproof-backend.jedgar.workers.dev',
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
