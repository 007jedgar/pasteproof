// src/shared/ai-scan-state.ts
/**
 * Shared AI Scan State Manager
 * 
 * Manages the state of AI detection scans across the extension,
 * allowing the popup to display loading status and results.
 */

import { AiDetection } from './api-client';

export type AiScanStatus = 'idle' | 'scanning' | 'success' | 'error';

export type AiScanState = {
  status: AiScanStatus;
  detectionCount: number;
  lastScanTime?: number;
  error?: string;
  currentDomain?: string;
  textPreview?: string;
};

const STORAGE_KEY = 'local:aiScanState';

/**
 * Set the AI scan state
 */
export async function setAiScanState(state: Partial<AiScanState>): Promise<void> {
  try {
    const currentState = await getAiScanState();
    const newState: AiScanState = {
      ...currentState,
      ...state,
    };
    
    await storage.setItem(STORAGE_KEY, newState);
    
    // Notify listeners
    notifyStateChange(newState);
  } catch (error) {
    console.error('[AI Scan State] Failed to set state:', error);
  }
}

/**
 * Get the current AI scan state
 */
export async function getAiScanState(): Promise<AiScanState> {
  try {
    const state = await storage.getItem<AiScanState>(STORAGE_KEY);
    return state || {
      status: 'idle',
      detectionCount: 0,
    };
  } catch (error) {
    console.error('[AI Scan State] Failed to get state:', error);
    return {
      status: 'idle',
      detectionCount: 0,
    };
  }
}

/**
 * Mark scan as started
 */
export async function startAiScan(domain?: string, textPreview?: string): Promise<void> {
  await setAiScanState({
    status: 'scanning',
    currentDomain: domain,
    textPreview,
    error: undefined,
  });
}

/**
 * Mark scan as completed with results
 */
export async function completeAiScan(detectionCount: number): Promise<void> {
  await setAiScanState({
    status: 'success',
    detectionCount,
    lastScanTime: Date.now(),
    error: undefined,
  });
}

/**
 * Mark scan as failed
 */
export async function failAiScan(error: string): Promise<void> {
  await setAiScanState({
    status: 'error',
    error,
    lastScanTime: Date.now(),
  });
}

/**
 * Reset to idle state
 */
export async function resetAiScanState(): Promise<void> {
  await setAiScanState({
    status: 'idle',
    detectionCount: 0,
    error: undefined,
  });
}

// State change listeners
type StateChangeListener = (state: AiScanState) => void;
const listeners: StateChangeListener[] = [];

/**
 * Subscribe to state changes
 */
export function subscribeToStateChanges(listener: StateChangeListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Notify all listeners of state change
 */
function notifyStateChange(state: AiScanState): void {
  listeners.forEach(listener => {
    try {
      listener(state);
    } catch (error) {
      console.error('[AI Scan State] Listener error:', error);
    }
  });
}

