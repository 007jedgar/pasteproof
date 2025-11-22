# Paste Proof - Browser Extension

This repository contains the frontend code for the **Paste Proof** browser extension. It's a privacy-first, Manifest V3 compliant extension built with the [WXT](https://wxt.dev/) framework to provide real-time detection of sensitive data (PII) directly in your browser.

## ✨ Features

- **Modern Tech Stack:** Built with React, TypeScript, and Material-UI for a clean and professional user interface.

- **Privacy-First:** All core PII detection happens locally in the browser. No data is sent to a server in the free version.

- **Smart Input Detection:** Intelligently recognizes when input fields are designed for specific data types (email, phone, password, etc.) and skips unnecessary warnings. See [Smart Input Detection Guide](./SMART_INPUT_DETECTION.md) for details.

- **Performant:** Uses a debounced scanning mechanism to ensure a smooth user experience without slowing down webpages.

- **High-Quality Code:** Enforced with ESLint for linting, Prettier for code formatting, and a full unit test suite with Vitest.

- **Cross-Browser Compatible:** Full support for Chrome, Firefox, and other Chromium-based browsers (Edge, Brave, Opera). See [Firefox Compatibility Guide](./FIREFOX_COMPATIBILITY.md) for details.

## 🚀 Getting Started

Follow these steps to set up a local development environment and load the extension into your browser.

### Prerequisites

- [Node.js](https://nodejs.org/en) (v18 or later)

- [pnpm](https://pnpm.io/) package manager

### 1. Installation

Clone the repository and install the necessary dependencies.

```
git clone <your-repo-url>
cd paste-proof-extension
pnpm install

```

### 2. Running in Development Mode

#### For Chrome/Edge/Brave:

```bash
pnpm dev
```

#### For Firefox:

```bash
pnpm dev:firefox
```

The WXT development server watches for file changes and automatically rebuilds the extension.

### 3. Loading the Unpacked Extension

#### Chrome/Edge/Brave:

Once the development server is running, load the extension into your browser:

1. Open your browser and navigate to the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`

2. Enable **"Developer mode"** (toggle in the top-right corner).

3. Click **"Load unpacked"**.

4. Select the `.output/chrome-mv3` directory from your project.

#### Firefox:

For Firefox development:

1. Open Firefox and navigate to `about:debugging`

2. Click **"This Firefox"**

3. Click **"Load Temporary Add-on"**

4. Select the `manifest.json` file from `.output/firefox-mv2` directory

The Paste Proof icon should now appear in your browser's toolbar, and the content script will be active on webpages.

> **Note:** For detailed Firefox setup and compatibility information, see [FIREFOX_COMPATIBILITY.md](./FIREFOX_COMPATIBILITY.md)

## 🛠️ Key Scripts

The following scripts are available in `package.json` to help with development and building the extension.

| Script               | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| `pnpm dev`           | Starts the development server for Chrome with hot-reloading.  |
| `pnpm dev:firefox`   | Starts the development server for Firefox with hot-reloading. |
| `pnpm build`         | Creates a production-ready build for Chrome.                  |
| `pnpm build:firefox` | Creates a production-ready build for Firefox.                 |
| `pnpm zip`           | Creates a `.zip` file for Chrome Web Store submission.        |
| `pnpm zip:firefox`   | Creates a `.zip` file for Firefox Add-ons submission.         |
| `pnpm test`          | Runs the unit test suite using Vitest.                        |
| `pnpm format`        | Formats all code according to Prettier rules.                 |
| `pnpm check`         | Checks for formatting issues without modifying files.         |
| `pnpm compile`       | Runs the TypeScript compiler to check for type errors.        |

## 📁 Project Structure

- **`src/entrypoints/`**: Contains the main entry points for the extension, such as the `content.tsx` script, the `popup/` UI, and the `background.ts` service worker.

- **`src/shared/`**: Holds shared logic and utilities, like the core `pii-detector.ts` engine.

- **`src/shared/components/`**: Contains reusable React components, such as the `WarningBadge.tsx`.

- **`wxt.config.ts`**: The main configuration file for the WXT framework, where the `manifest.json` is defined.

- **`public/`**: Static assets like icons and images are placed here.

## 🦊 Browser Compatibility

PasteProof is fully compatible with:

- ✅ **Google Chrome** (Manifest V3)
- ✅ **Mozilla Firefox** (Manifest V2/V3)
- ✅ **Microsoft Edge** (Chromium-based)
- ✅ **Brave Browser**
- ✅ **Opera**
- ✅ **Other Chromium-based browsers**

### Browser-Specific Notes

- **Firefox**: Uses browser-specific manifest with conditional features. See [FIREFOX_COMPATIBILITY.md](./FIREFOX_COMPATIBILITY.md) for detailed information.
- **Chrome/Edge**: Includes `externally_connectable` for enhanced auth flow.
- All browsers use the standardized `browser.*` WebExtensions API for maximum compatibility.

For detailed Firefox-specific setup, testing, and submission instructions, see our [Firefox Compatibility Guide](./FIREFOX_COMPATIBILITY.md).

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
