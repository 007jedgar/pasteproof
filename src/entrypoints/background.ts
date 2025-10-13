// entrypoints/background.ts
export default defineBackground(() => {
  console.log('[Paste Proof] Service worker started.');

  browser.runtime.onInstalled.addListener(() => {
    console.log('[Paste Proof] Extension installed successfully!');
  });
});
