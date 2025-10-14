# Paste Proof - Browser Extension

This repository contains the frontend code for the **Paste Proof** browser extension. It's a privacy-first, Manifest V3 compliant extension built with the [WXT](https://wxt.dev/) framework to provide real-time detection of sensitive data (PII) directly in your browser.

## ✨ Features

* **Modern Tech Stack:** Built with React, TypeScript, and Material-UI for a clean and professional user interface.

* **Privacy-First:** All core PII detection happens locally in the browser. No data is sent to a server in the free version.

* **Performant:** Uses a debounced scanning mechanism to ensure a smooth user experience without slowing down webpages.

* **High-Quality Code:** Enforced with ESLint for linting, Prettier for code formatting, and a full unit test suite with Vitest.

* **Cross-Browser Compatible:** WXT framework makes it easy to build and package for Chrome, Firefox, and other Chromium-based browsers.

## 🚀 Getting Started

Follow these steps to set up a local development environment and load the extension into your browser.

### Prerequisites

* [Node.js](https://nodejs.org/en) (v18 or later)

* [pnpm](https://pnpm.io/) package manager

### 1. Installation

Clone the repository and install the necessary dependencies.

```
git clone <your-repo-url>
cd paste-proof-extension
pnpm install

```

### 2. Running in Development Mode

This command will start the WXT development server. It watches for file changes and automatically rebuilds the extension.

```
pnpm dev

```

### 3. Loading the Unpacked Extension

Once the development server is running, you need to load the extension into your browser:

1. Open your browser (e.g., Chrome, Edge) and navigate to the extensions page (`chrome://extensions` or `edge://extensions`).

2. Enable **"Developer mode"** (usually a toggle in the top-right corner).

3. Click the **"Load unpacked"** button.

4. Select the `paste-proof-extension/.wxt/chrome-mv3` directory from your project.

The Paste Proof icon should now appear in your browser's toolbar, and the content script will be active on webpages.

## 🛠️ Key Scripts

The following scripts are available in `package.json` to help with development and building the extension.

| Script | Description | 
 | ----- | ----- | 
| `pnpm dev` | Starts the development server for Chrome with hot-reloading. | 
| `pnpm dev:firefox` | Starts the development server for Firefox. | 
| `pnpm build` | Creates a production-ready build of the extension. | 
| `pnpm zip` | Creates a `.zip` file of the build, ready for store submission. | 
| `pnpm test` | Runs the unit test suite using Vitest. | 
| `pnpm format` | Formats all code according to Prettier rules. | 
| `pnpm check` | Checks for formatting issues without modifying files. | 
| `pnpm compile` | Runs the TypeScript compiler to check for type errors. | 

## 📁 Project Structure

* **`src/entrypoints/`**: Contains the main entry points for the extension, such as the `content.tsx` script, the `popup/` UI, and the `background.ts` service worker.

* **`src/shared/`**: Holds shared logic and utilities, like the core `pii-detector.ts` engine.

* **`src/shared/components/`**: Contains reusable React components, such as the `WarningBadge.tsx`.

* **`wxt.config.ts`**: The main configuration file for the WXT framework, where the `manifest.json` is defined.

* **`public/`**: Static assets like icons and images are placed here.

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.