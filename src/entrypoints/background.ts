/*global chrome*/

import { getApiClient } from "@/shared/api-client";

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
          console.log(`Logged ${batch.length} detections`);
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
if (
  typeof chrome !== 'undefined' &&
  chrome.runtime &&
  chrome.runtime.id
) {
  chrome.runtime.onSuspend.addListener(() => {
    detectionQueue.flush();
  });
}

export default defineBackground(() => {
  console.log('[Paste Proof] Service worker started.');

  browser.runtime.onInstalled.addListener(() => {
    console.log('[Paste Proof] Extension installed successfully!');
  });
});
