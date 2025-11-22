import { getApiClient } from '@/shared/api-client';

// entrypoints/background.ts
interface QueuedDetection {
  type: string;
  domain: string;
  action: 'detected' | 'blocked' | 'anonymized';
  metadata?: Record<string, any>;
  timestamp: number;
}

class DetectionQueue {
  private queue: QueuedDetection[] = [];
  private processing = false;
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly BATCH_SIZE = 10;

  async add(detection: Omit<QueuedDetection, 'timestamp'>) {
    this.queue.push({
      ...detection,
      timestamp: Date.now(),
    });

    // Keep queue size manageable
    if (this.queue.length > this.MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-this.MAX_QUEUE_SIZE);
    }

    // Process queue
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    try {
      const apiClient = getApiClient();
      if (!apiClient) {
        this.processing = false;
        return;
      }

      // Process in batches
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.BATCH_SIZE);

        try {
          await apiClient.logDetectionsBatch(batch);
        } catch (error) {
          console.error('Failed to log batch, re-queueing:', error);
          // Put failed batch back at the front
          this.queue.unshift(...batch);
          break;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  // Call this periodically or on browser events
  flush() {
    this.processQueue();
  }
}

const detectionQueue = new DetectionQueue();

// Export for use in content scripts
export function queueDetection(detection: Omit<QueuedDetection, 'timestamp'>) {
  detectionQueue.add(detection);
}

// Flush queue periodically
setInterval(() => {
  detectionQueue.flush();
}, 30000); // Every 30 seconds

// Flush on browser events
// Note: onSuspend is Chrome-specific and not available in Firefox
// Firefox uses different lifecycle events
if (
  typeof chrome !== 'undefined' &&
  chrome.runtime &&
  chrome.runtime.onSuspend
) {
  chrome.runtime.onSuspend.addListener(() => {
    detectionQueue.flush();
  });
}

// Context menu helper function
function createContextMenu() {
  try {
    browser.contextMenus.create({
      id: 'pasteproof-rescan',
      title: 'Rescan for PII',
      contexts: ['editable'],
    });
  } catch (error) {
    console.error('[Paste Proof] Failed to create context menu:', error);
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    // Create context menu on install
    createContextMenu();
  });

  // Recreate context menu on startup (for Firefox compatibility)
  browser.runtime.onStartup.addListener(() => {
    createContextMenu();
  });

  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'pasteproof-rescan' && tab?.id) {
      // Send message to content script to trigger rescan
      browser.tabs
        .sendMessage(tab.id, {
          action: 'rescanForPii',
        })
        .then(() => {
          console.log('[Paste Proof] Rescan message sent successfully');
        })
        .catch(error => {
          console.error('[Paste Proof] Failed to send rescan message:', error);
        });
    }
  });
});
