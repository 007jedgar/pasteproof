// src/shared/api-cache.ts
// Persistent caching for API responses to reduce redundant calls

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

export interface CacheConfig {
  // TTL in milliseconds for each cache type
  whitelist: number;
  patterns: number;
  teams: number;
  teamPolicies: number;
}

// Default cache durations
const DEFAULT_CONFIG: CacheConfig = {
  whitelist: 5 * 60 * 1000, // 5 minutes
  patterns: 30 * 60 * 1000, // 30 minutes
  teams: 30 * 60 * 1000, // 30 minutes
  teamPolicies: 30 * 60 * 1000, // 30 minutes
};

// Storage key prefixes
const CACHE_PREFIX = 'pasteproof_cache_';
const CACHE_KEYS = {
  whitelist: `${CACHE_PREFIX}whitelist`,
  patterns: `${CACHE_PREFIX}patterns`,
  teams: `${CACHE_PREFIX}teams`,
  teamPolicies: `${CACHE_PREFIX}teamPolicies`,
} as const;

// Helper to get browser storage (works in extension context)
const getBrowserStorage = () => {
  if (typeof browser !== 'undefined' && browser.storage) {
    return browser.storage.local;
  }
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome.storage.local;
  }
  return null;
};

class ApiCache {
  private config: CacheConfig;
  // In-memory cache for faster lookups within same session
  private memoryCache: Map<string, CacheEntry<any>> = new Map();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate cache key for whitelist check
   */
  private getWhitelistKey(domain: string): string {
    return `${CACHE_KEYS.whitelist}:${domain}`;
  }

  /**
   * Generate cache key for team policies
   */
  private getTeamPoliciesKey(teamId: string): string {
    return `${CACHE_KEYS.teamPolicies}:${teamId}`;
  }

  /**
   * Check if a cache entry is still valid
   */
  private isValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
    if (!entry) return false;
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Get item from browser storage
   */
  private async storageGet<T>(key: string): Promise<T | null> {
    const storage = getBrowserStorage();
    if (!storage) return null;

    try {
      const result = await storage.get(key);
      return result[key] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Set item in browser storage
   */
  private async storageSet(key: string, value: any): Promise<void> {
    const storage = getBrowserStorage();
    if (!storage) return;

    try {
      await storage.set({ [key]: value });
    } catch (error) {
      console.warn('Failed to write to storage:', error);
    }
  }

  /**
   * Remove item from browser storage
   */
  private async storageRemove(key: string): Promise<void> {
    const storage = getBrowserStorage();
    if (!storage) return;

    try {
      await storage.remove(key);
    } catch (error) {
      console.warn('Failed to remove from storage:', error);
    }
  }

  /**
   * Get cached whitelist check result
   */
  async getWhitelistCheck(domain: string): Promise<boolean | null> {
    const key = this.getWhitelistKey(domain);

    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (this.isValid(memEntry)) {
      return memEntry.data;
    }

    // Check persistent storage
    try {
      const entry = await this.storageGet<CacheEntry<boolean>>(key);
      if (this.isValid(entry)) {
        // Populate memory cache
        this.memoryCache.set(key, entry);
        return entry.data;
      }
    } catch (error) {
      console.warn('Failed to read whitelist cache:', error);
    }

    return null;
  }

  /**
   * Cache whitelist check result
   */
  async setWhitelistCheck(domain: string, isWhitelisted: boolean): Promise<void> {
    const key = this.getWhitelistKey(domain);
    const entry: CacheEntry<boolean> = {
      data: isWhitelisted,
      timestamp: Date.now(),
      ttl: this.config.whitelist,
    };

    // Update memory cache
    this.memoryCache.set(key, entry);

    // Update persistent storage
    await this.storageSet(key, entry);
  }

  /**
   * Invalidate whitelist cache for a domain (call after add/remove)
   */
  async invalidateWhitelistCheck(domain: string): Promise<void> {
    const key = this.getWhitelistKey(domain);
    this.memoryCache.delete(key);
    await this.storageRemove(key);
  }

  /**
   * Get cached patterns
   */
  async getPatterns<T>(): Promise<T | null> {
    const key = CACHE_KEYS.patterns;

    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (this.isValid(memEntry)) {
      return memEntry.data;
    }

    // Check persistent storage
    try {
      const entry = await this.storageGet<CacheEntry<T>>(key);
      if (this.isValid(entry)) {
        this.memoryCache.set(key, entry);
        return entry.data;
      }
    } catch (error) {
      console.warn('Failed to read patterns cache:', error);
    }

    return null;
  }

  /**
   * Cache patterns
   */
  async setPatterns<T>(patterns: T): Promise<void> {
    const key = CACHE_KEYS.patterns;
    const entry: CacheEntry<T> = {
      data: patterns,
      timestamp: Date.now(),
      ttl: this.config.patterns,
    };

    this.memoryCache.set(key, entry);
    await this.storageSet(key, entry);
  }

  /**
   * Invalidate patterns cache (call after create/update/delete)
   */
  async invalidatePatterns(): Promise<void> {
    const key = CACHE_KEYS.patterns;
    this.memoryCache.delete(key);
    await this.storageRemove(key);
  }

  /**
   * Get cached teams
   */
  async getTeams<T>(): Promise<T | null> {
    const key = CACHE_KEYS.teams;

    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (this.isValid(memEntry)) {
      return memEntry.data;
    }

    // Check persistent storage
    try {
      const entry = await this.storageGet<CacheEntry<T>>(key);
      if (this.isValid(entry)) {
        this.memoryCache.set(key, entry);
        return entry.data;
      }
    } catch (error) {
      console.warn('Failed to read teams cache:', error);
    }

    return null;
  }

  /**
   * Cache teams
   */
  async setTeams<T>(teams: T): Promise<void> {
    const key = CACHE_KEYS.teams;
    const entry: CacheEntry<T> = {
      data: teams,
      timestamp: Date.now(),
      ttl: this.config.teams,
    };

    this.memoryCache.set(key, entry);
    await this.storageSet(key, entry);
  }

  /**
   * Invalidate teams cache
   */
  async invalidateTeams(): Promise<void> {
    const key = CACHE_KEYS.teams;
    this.memoryCache.delete(key);
    await this.storageRemove(key);
  }

  /**
   * Get cached team policies
   */
  async getTeamPolicies<T>(teamId: string): Promise<T | null> {
    const key = this.getTeamPoliciesKey(teamId);

    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (this.isValid(memEntry)) {
      return memEntry.data;
    }

    // Check persistent storage
    try {
      const entry = await this.storageGet<CacheEntry<T>>(key);
      if (this.isValid(entry)) {
        this.memoryCache.set(key, entry);
        return entry.data;
      }
    } catch (error) {
      console.warn('Failed to read team policies cache:', error);
    }

    return null;
  }

  /**
   * Cache team policies
   */
  async setTeamPolicies<T>(teamId: string, policies: T): Promise<void> {
    const key = this.getTeamPoliciesKey(teamId);
    const entry: CacheEntry<T> = {
      data: policies,
      timestamp: Date.now(),
      ttl: this.config.teamPolicies,
    };

    this.memoryCache.set(key, entry);
    await this.storageSet(key, entry);
  }

  /**
   * Invalidate team policies cache
   */
  async invalidateTeamPolicies(teamId?: string): Promise<void> {
    if (teamId) {
      const key = this.getTeamPoliciesKey(teamId);
      this.memoryCache.delete(key);
      await this.storageRemove(key);
    } else {
      // Invalidate all team policies from memory cache
      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(CACHE_KEYS.teamPolicies)) {
          this.memoryCache.delete(key);
        }
      }
    }
  }

  /**
   * Clear all caches (call on logout or auth change)
   */
  async clearAll(): Promise<void> {
    // Collect dynamic keys (whitelist:*, teamPolicies:*) from memory before clearing
    const dynamicKeys: string[] = [];
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(CACHE_KEYS.whitelist) || key.startsWith(CACHE_KEYS.teamPolicies)) {
        dynamicKeys.push(key);
      }
    }

    this.memoryCache.clear();

    // Remove static keys + any dynamic keys we tracked in memory
    await Promise.all([
      this.storageRemove(CACHE_KEYS.patterns),
      this.storageRemove(CACHE_KEYS.teams),
      ...dynamicKeys.map(key => this.storageRemove(key)),
    ]);

    // Also scan browser storage for any dynamic keys we may have missed
    // (e.g., from a previous page load that populated storage but not this memory cache)
    const storage = getBrowserStorage();
    if (storage) {
      try {
        const allItems = await storage.get(null);
        const staleKeys = Object.keys(allItems).filter(
          key => key.startsWith(CACHE_KEYS.whitelist) || key.startsWith(CACHE_KEYS.teamPolicies)
        );
        if (staleKeys.length > 0) {
          await storage.remove(staleKeys);
        }
      } catch {
        // Best-effort cleanup
      }
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { memorySize: number; keys: string[] } {
    return {
      memorySize: this.memoryCache.size,
      keys: Array.from(this.memoryCache.keys()),
    };
  }
}

// Export singleton instance
export const apiCache = new ApiCache();
