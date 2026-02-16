// src/shared/site-scan-optimizer.ts
// Helper utility to cache site safety scan results per URL

import { SiteScanResult } from './api-client';

export interface SiteScanCache {
  url: string;
  result: SiteScanResult;
  timestamp: number;
}

export class SiteScanOptimizer {
  private cache: Map<string, SiteScanCache> = new Map();
  // Cache for 5 minutes - site safety doesn't change frequently
  private readonly CACHE_DURATION = 5 * 60 * 1000;

  /**
   * Normalize URL to use as cache key (strip query params and hash)
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Use origin + pathname as the cache key
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Get cached scan result if available
   */
  getCachedResult(url: string): SiteScanResult | null {
    const normalizedUrl = this.normalizeUrl(url);
    const cached = this.cache.get(normalizedUrl);

    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.cache.delete(normalizedUrl);
      return null;
    }

    return cached.result;
  }

  /**
   * Store scan result in cache
   */
  cacheResult(url: string, result: SiteScanResult): void {
    const normalizedUrl = this.normalizeUrl(url);

    this.cache.set(normalizedUrl, {
      url: normalizedUrl,
      result,
      timestamp: Date.now(),
    });

    // Clean up old cache entries
    this.cleanCache();
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [url, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_DURATION) {
        this.cache.delete(url);
      }
    }
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if a scan is needed for this URL
   */
  shouldScan(url: string): boolean {
    const cached = this.getCachedResult(url);
    return cached === null;
  }
}

// Export singleton instance
export const siteScanOptimizer = new SiteScanOptimizer();
