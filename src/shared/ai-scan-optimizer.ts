// src/shared/ai-scan-optimizer.ts
// Helper utilities to optimize AI scanning and prevent excessive API calls

export interface ScanCache {
  hash: string;
  detections: any[];
  timestamp: number;
}

export class AiScanOptimizer {
  private cache: Map<string, ScanCache> = new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private readonly MIN_TEXT_LENGTH = 10;
  private readonly MAX_TEXT_LENGTH = 5000;
  private readonly SIMILARITY_THRESHOLD = 0.85;

  /**
   * Simple hash function for text comparison
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Calculate text similarity (simple approach)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const len1 = text1.length;
    const len2 = text2.length;
    const maxLen = Math.max(len1, len2);

    if (maxLen === 0) return 1.0;

    // Simple character-based similarity
    const distance = this.levenshteinDistance(text1, text2);
    return 1 - distance / maxLen;
  }

  /**
   * Levenshtein distance for similarity calculation
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1.charAt(i - 1) === str2.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Check if text should be scanned
   */
  shouldScan(text: string): boolean {
    // Don't scan if too short or too long
    if (
      text.length < this.MIN_TEXT_LENGTH ||
      text.length > this.MAX_TEXT_LENGTH
    ) {
      return false;
    }

    // Don't scan if text is mostly whitespace
    const trimmed = text.trim();
    if (trimmed.length < this.MIN_TEXT_LENGTH) {
      return false;
    }

    // Don't scan if text is very repetitive (like "aaaaaaa")
    const uniqueChars = new Set(text).size;
    if (uniqueChars < 5 && text.length > 20) {
      return false;
    }

    return true;
  }

  /**
   * Get cached scan results if available
   */
  getCachedResult(text: string): any[] | null {
    const hash = this.hashText(text);
    const cached = this.cache.get(hash);

    if (!cached) {
      // Check for similar text in cache
      for (const [_, entry] of this.cache.entries()) {
        if (Date.now() - entry.timestamp < this.CACHE_DURATION) {
          // Reconstruct original text from hash (not possible, so we store similarity check differently)
          // For now, just return null if exact hash not found
          continue;
        }
      }
      return null;
    }

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.cache.delete(hash);
      return null;
    }

    return cached.detections;
  }

  /**
   * Store scan results in cache
   */
  cacheResult(text: string, detections: any[]): void {
    const hash = this.hashText(text);

    this.cache.set(hash, {
      hash,
      detections,
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
    for (const [hash, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_DURATION) {
        this.cache.delete(hash);
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
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.values()).filter(
        e => Date.now() - e.timestamp < this.CACHE_DURATION
      ).length,
    };
  }

  /**
   * Determine if text has changed significantly enough to warrant a new scan
   */
  hasSignificantChange(oldText: string, newText: string): boolean {
    // If length difference is significant
    const lengthDiff = Math.abs(oldText.length - newText.length);
    if (lengthDiff > 20) {
      return true;
    }

    // If similarity is below threshold
    const similarity = this.calculateSimilarity(oldText, newText);
    if (similarity < this.SIMILARITY_THRESHOLD) {
      return true;
    }

    return false;
  }
}

// Export singleton instance
export const aiScanOptimizer = new AiScanOptimizer();
