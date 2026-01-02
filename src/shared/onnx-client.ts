// src/shared/onnx-client.ts
/**
 * ONNX-based PII Detection Client
 *
 * This client runs model inference in the browser for PII detection.
 * It runs in parallel with the API-based detection for comparison and testing.
 *
 * Uses transformers.js pipeline which automatically uses ONNX when available,
 * falling back to WebGPU or WASM execution.
 *
 * SETUP:
 * 1. Install dependencies: pnpm add @xenova/transformers
 * 2. Ensure your HuggingFace model has properly formatted tokenizer files
 *    (tokenizer.json and tokenizer_config.json)
 * 3. Update HUGGINGFACE_MODEL_ID with your model ID
 *
 * USAGE EXAMPLE (run in parallel with API):
 * ```typescript
 * import { getOnnxDetector } from '@/shared/onnx-client';
 * import { getApiClient } from '@/shared/api-client';
 *
 * // Run both in parallel
 * const [apiResult, onnxResult] = await Promise.allSettled([
 *   apiClient.analyzeContext(text, context, fieldType),
 *   getOnnxDetector().analyzeContext(text, context, fieldType)
 * ]);
 *
 * // Compare results
 * console.log('API detections:', apiResult);
 * console.log('ONNX detections:', onnxResult);
 * ```
 */

import type { AiAnalysisResult, AiDetection } from './api-client';

// Lazy-load transformers for pipeline
let pipeline: any = null;
let env: any = null;
let dependenciesLoaded = false;

async function loadDependencies() {
  if (dependenciesLoaded) return;

  try {
    console.log('[ONNX] Loading dependencies...');
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    env = transformers.env;

    // Configure transformers.js to use HuggingFace CDN
    env.allowRemoteModels = true;
    env.allowLocalModels = false;

    // Set custom CDN if needed (optional - defaults to HuggingFace)
    // env.remoteURL = 'https://huggingface.co/';
    // env.remotePathTemplate = '{model}/resolve/{revision}/';

    dependenciesLoaded = true;
    console.log('[ONNX] Dependencies loaded successfully');
    console.log('[ONNX] Config:', {
      allowRemoteModels: env.allowRemoteModels,
      allowLocalModels: env.allowLocalModels,
    });
  } catch (error) {
    console.error('[ONNX] Failed to load dependencies:', error);
    throw new Error(
      'Failed to load ONNX dependencies. Please ensure @xenova/transformers is installed.'
    );
  }
}

// Model ID - Try using a pre-converted Xenova model first for testing
// These models are already optimized for transformers.js
// Once working, we can convert your custom model properly
const HUGGINGFACE_MODEL_ID = 'Xenova/bert-base-NER';

// Your custom model (uncomment once tokenizer is fixed):
// const HUGGINGFACE_MODEL_ID = 'joneauxedgar/pasteproof-pii-detector-v2';

export class OnnxPiiDetector {
  private detector: any = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the ONNX model using transformers.js pipeline
   * Uses caching to avoid re-downloading on subsequent calls
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.detector) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = this._initialize();

    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
    }
  }

  private async _initialize(): Promise<void> {
    try {
      // Load dependencies first
      await loadDependencies();

      console.log(
        '[ONNX] Loading model from HuggingFace:',
        HUGGINGFACE_MODEL_ID
      );
      const startTime = performance.now();

      // Use transformers.js pipeline - it handles everything automatically
      console.log('[ONNX] Loading pipeline...');
      this.detector = await pipeline(
        'token-classification',
        HUGGINGFACE_MODEL_ID,
        {
          quantized: true, // Use quantized version for faster inference
        }
      );
      console.log('[ONNX] Pipeline loaded');

      const duration = Math.round(performance.now() - startTime);
      console.log(`[ONNX] Pipeline loaded successfully in ${duration}ms`);
      console.log('[ONNX] PII Detector initialized successfully');
    } catch (error) {
      console.error('[ONNX] Initialization error:', error);
      // Reset state on error
      this.detector = null;
      throw error;
    }
  }

  /**
   * Analyze text for PII using the ONNX model
   * Returns results in the same format as the API analyzeContext method
   */
  async analyzeContext(
    text: string,
    context?: string,
    fieldType?: 'name' | 'email' | 'address' | 'phone' | 'freeform' | 'unknown'
  ): Promise<AiAnalysisResult> {
    if (!text || text.trim().length === 0) {
      return {
        hasPII: false,
        confidence: 0,
        detections: [],
        risk_level: 'low',
      };
    }

    // Ensure model is initialized
    if (!this.detector) {
      await this.initialize();
    }

    if (!this.detector) {
      throw new Error('Failed to initialize ONNX model');
    }

    const startTime = performance.now();
    console.log('[ONNX] Starting detection for text:', {
      length: text.length,
      preview: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      context,
      fieldType,
    });

    try {
      // Run detection using the pipeline
      console.log('[ONNX] Running pipeline...');
      const results = await this.detector(text, {
        aggregation_strategy: 'simple',
      });

      console.log('[ONNX] Pipeline results:', results);

      // Convert to our detection format
      const detections: AiDetection[] = results.map((entity: any) => ({
        type: entity.entity_group || entity.entity,
        value: entity.word,
        confidence: Math.round(entity.score * 100) / 100,
        reason: `Detected by ONNX model with ${Math.round(entity.score * 100)}% confidence`,
      }));

      const duration = Math.round(performance.now() - startTime);

      // Calculate overall metrics
      const hasPII = detections.length > 0;
      const avgConfidence =
        detections.length > 0
          ? detections.reduce((sum, d) => sum + d.confidence, 0) /
            detections.length
          : 0;

      // Determine risk level based on detections
      const riskLevel = this.calculateRiskLevel(detections, avgConfidence);

      // Log summary
      console.log(`[ONNX] Detection completed in ${duration}ms`, {
        hasPII,
        detectionCount: detections.length,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        riskLevel,
        detections: detections.map(d => ({
          type: d.type,
          value: d.value.substring(0, 50) + (d.value.length > 50 ? '...' : ''),
          confidence: d.confidence,
        })),
      });

      return {
        hasPII,
        confidence: avgConfidence,
        detections,
        risk_level: riskLevel,
      };
    } catch (error) {
      console.error('[ONNX] Detection error:', error);
      throw error;
    }
  }

  /**
   * Calculate risk level based on detections
   */
  private calculateRiskLevel(
    detections: AiDetection[],
    avgConfidence: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (detections.length === 0) {
      return 'low';
    }

    // Check for high-risk PII types
    const highRiskTypes = [
      'CREDIT_CARD',
      'SSN',
      'PRIVATE_KEY',
      'API_KEY',
      'AWS_KEY',
    ];
    const hasHighRisk = detections.some(d =>
      highRiskTypes.includes(d.type.toUpperCase())
    );

    if (hasHighRisk || avgConfidence > 0.9) {
      return 'critical';
    }

    if (avgConfidence > 0.7 || detections.length > 3) {
      return 'high';
    }

    if (avgConfidence > 0.5 || detections.length > 1) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.detector = null;
    this.isInitializing = false;
    this.initPromise = null;
  }
}

// Singleton instance
let onnxDetector: OnnxPiiDetector | null = null;

/**
 * Get or create the ONNX detector instance
 */
export function getOnnxDetector(): OnnxPiiDetector {
  try {
    if (!onnxDetector) {
      console.log('[ONNX] Creating new detector instance');
      onnxDetector = new OnnxPiiDetector();
    }
    return onnxDetector;
  } catch (error) {
    console.error('[ONNX] Failed to create detector:', error);
    throw error;
  }
}

/**
 * Initialize the ONNX detector (call this early, e.g., in background script)
 */
export async function initializeOnnxDetector(): Promise<void> {
  const detector = getOnnxDetector();
  await detector.initialize();
}

/**
 * Clear the ONNX detector instance
 */
export function clearOnnxDetector(): void {
  if (onnxDetector) {
    onnxDetector.dispose();
    onnxDetector = null;
  }
}
