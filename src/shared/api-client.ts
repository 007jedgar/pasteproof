// src/shared/api-client.ts
import { CustomPattern } from './pii-detector';
import { apiCache } from './api-cache';

// Determine API base URL from environment variable
// Set VITE_SELF_HOSTED_API_URL in .env to use self-hosted backend
// If not set, defaults to production API
const API_BASE_URL =
  (import.meta.env.VITE_SELF_HOSTED_API_URL as string | undefined) ||
  'https://api.pasteproof.com';

export type ApiConfig = {
  apiKey: string;
  baseUrl?: string;
};

export type AiDetection = {
  type: string;
  value: string;
  confidence: number;
  reason: string;
};

export type AiAnalysisResult = {
  hasPII: boolean;
  confidence: number;
  detections: AiDetection[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
};

export type AuditLog = {
  id: string;
  user_id: string;
  event_type: string;
  domain: string;
  pii_type: string;
  was_anonymized: number;
  metadata: string;
  timestamp: number;
};

export type DashboardStats = {
  total_detections: number;
  total_anonymizations: number;
  total_ai_scans: number;
  most_common_pii: Array<{ type: string; count: number }>;
  riskiest_domains: Array<{ domain: string; count: number }>;
  detections_by_day: Array<{ date: string; count: number }>;
};

export type WhitelistSite = {
  id: string;
  user_id: string;
  domain: string;
  is_active: number;
  created_at: number;
};

export type Team = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
};

export type SiteScanRequest = {
  url: string;
  meta?: {
    title?: string;
    has_shopping_cart?: boolean;
    visible_text_snippet?: string;
  };
  deep_analysis?: boolean;
};

export type SiteScanResult = {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'MALICIOUS';
  score: number;
  flags: string[];
  details: {
    business_logic?: {
      brand?: string;
      reason?: string;
      official_domains?: string[];
    };
    domain_forensics?: {
      age_days?: number;
      is_new_domain?: boolean;
      registrar?: string;
    };
  };
  analysis_time_ms: number;
};

export type TeamPolicy = {
  id: string;
  team_id: string;
  name: string;
  enabled: boolean;
  policy_data:
    | string
    | {
        patterns?: Array<{
          id: string;
          name: string;
          pattern: string;
          description?: string;
          pattern_type: string;
        }>;
        domainRules?: any;
        domainBlacklist?: string[];
        domainWhitelist?: string[];
        alertThreshold?: any;
        complianceTemplate?: string;
        customPatternLimit?: number;
        [key: string]: any;
      };
  created_at: number | string;
  updated_at: number | string;
};

export class PasteProofApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ApiConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || API_BASE_URL;
  }

  /**
   * Validates and sanitizes endpoint paths to prevent path traversal attacks
   */
  private validateEndpoint(endpoint: string): string {
    // Remove any protocol, host, or query strings
    const cleanEndpoint = endpoint.split('?')[0].split('#')[0];

    // Ensure endpoint starts with /
    if (!cleanEndpoint.startsWith('/')) {
      throw new Error('Invalid endpoint: must start with /');
    }

    // Prevent path traversal attempts
    if (cleanEndpoint.includes('..') || cleanEndpoint.includes('//')) {
      throw new Error('Invalid endpoint: path traversal detected');
    }

    // Only allow alphanumeric, hyphens, underscores, and forward slashes
    if (!/^\/[a-zA-Z0-9\/\-_]+$/.test(cleanEndpoint)) {
      throw new Error('Invalid endpoint: contains invalid characters');
    }

    return cleanEndpoint;
  }

  /**
   * Validates and sanitizes ID parameters to prevent injection
   */
  private validateId(id: string): string {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid ID: must be a non-empty string');
    }

    // Only allow alphanumeric, hyphens, and underscores
    if (!/^[a-zA-Z0-9\-_]+$/.test(id)) {
      throw new Error('Invalid ID: contains invalid characters');
    }

    // Limit length to prevent DoS
    if (id.length > 100) {
      throw new Error('Invalid ID: exceeds maximum length');
    }

    return id;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Validate and sanitize endpoint
    const safeEndpoint = this.validateEndpoint(endpoint);
    const url = `${this.baseUrl}${safeEndpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      // Sanitize error message to prevent information disclosure
      const errorMessage = error?.error || `API error: ${response.status}`;
      throw new Error(errorMessage);
    }
    return response.json();
  }

  // Whitelist methods
  async getWhitelist(): Promise<WhitelistSite[]> {
    const data = await this.fetch<{ whitelist: WhitelistSite[] }>(
      '/v1/whitelist'
    );
    return data.whitelist;
  }

  /**
   * Validates domain format to prevent injection
   */
  private validateDomain(domain: string): string {
    if (!domain || typeof domain !== 'string') {
      throw new Error('Invalid domain: must be a non-empty string');
    }

    // Basic domain validation - allow alphanumeric, dots, hyphens
    // This is a simplified check; server should do full validation
    if (
      !/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/.test(
        domain
      )
    ) {
      throw new Error('Invalid domain format');
    }

    // Limit length
    if (domain.length > 253) {
      throw new Error('Domain exceeds maximum length');
    }

    return domain.trim().toLowerCase();
  }

  async addToWhitelist(domain: string): Promise<WhitelistSite> {
    const safeDomain = this.validateDomain(domain);
    const data = await this.fetch<{
      success: boolean;
      whitelist: WhitelistSite;
    }>('/v1/whitelist', {
      method: 'POST',
      body: JSON.stringify({ domain: safeDomain }),
    });

    // Invalidate cache for this domain
    await apiCache.invalidateWhitelistCheck(safeDomain);

    return data.whitelist;
  }

  async removeFromWhitelist(whitelistId: string, domain?: string): Promise<void> {
    const safeId = this.validateId(whitelistId);
    await this.fetch(`/v1/whitelist/${safeId}`, {
      method: 'DELETE',
    });

    // Invalidate cache so isWhitelisted() doesn't return stale results
    if (domain) {
      await apiCache.invalidateWhitelistCheck(this.validateDomain(domain));
    }
  }

  async isWhitelisted(domain: string): Promise<boolean> {
    const safeDomain = this.validateDomain(domain);

    // Check cache first
    const cached = await apiCache.getWhitelistCheck(safeDomain);
    if (cached !== null) {
      return cached;
    }

    const data = await this.fetch<{ whitelisted: boolean }>(
      '/v1/whitelist/check',
      {
        method: 'POST',
        body: JSON.stringify({ domain: safeDomain }),
      }
    );

    // Cache the result
    await apiCache.setWhitelistCheck(safeDomain, data.whitelisted);

    return data.whitelisted;
  }

  /**
   * Validates text input to prevent DoS and injection
   */
  private validateText(text: string, maxLength: number = 50000): string {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text: must be a non-empty string');
    }

    if (text.length > maxLength) {
      throw new Error(`Text exceeds maximum length of ${maxLength} characters`);
    }

    return text;
  }

  /**
   * Validates context (domain) input
   */
  private validateContext(context: string): string {
    if (!context || typeof context !== 'string') {
      throw new Error('Invalid context: must be a non-empty string');
    }

    // Context should be a domain or hostname
    if (context.length > 253) {
      throw new Error('Context exceeds maximum length');
    }

    return context.trim();
  }

  // Site Safety Scan
  // Returns null when the endpoint is unavailable (e.g. self-hosted backends
  // that don't implement /v1/scan). Callers should treat null as "no result".
  async scanUrl(request: SiteScanRequest): Promise<SiteScanResult | null> {
    if (!request.url || typeof request.url !== 'string') {
      console.warn('scanUrl: invalid URL argument');
      return null;
    }

    try {
      new URL(request.url);
    } catch {
      console.warn('scanUrl: malformed URL', request.url);
      return null;
    }

    try {
      const data = await this.fetch<SiteScanResult>('/v1/scan', {
        method: 'POST',
        body: JSON.stringify({
          url: request.url,
          meta: request.meta,
          deep_analysis: request.deep_analysis ?? false,
        }),
      });
      return data;
    } catch (error) {
      console.warn('scanUrl: endpoint unavailable, skipping site safety scan:', error);
      return null;
    }
  }

  // AI Context Analysis
  async analyzeContext(
    text: string,
    context?: string,
    fieldType?: 'name' | 'email' | 'address' | 'phone' | 'freeform' | 'unknown'
  ): Promise<AiAnalysisResult> {
    const safeText = this.validateText(text, 50000);
    const body: {
      text: string;
      context?: string;
      fieldType?: string;
    } = { text: safeText };

    if (context) {
      body.context = this.validateContext(context);
    }

    // Validate fieldType enum
    const validFieldTypes = [
      'name',
      'email',
      'address',
      'phone',
      'freeform',
      'unknown',
    ];
    if (fieldType && !validFieldTypes.includes(fieldType)) {
      throw new Error(
        `Invalid fieldType: must be one of ${validFieldTypes.join(', ')}`
      );
    }

    if (fieldType) {
      body.fieldType = fieldType;
    }

    const data = await this.fetch<{
      success: boolean;
      analysis: AiAnalysisResult;
      metadata: {
        text_length: number;
        model: string;
        provider: string;
      };
    }>('/v1/analyze-context', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data.analysis;
  }

  async getAuditLogs(params?: {
    startDate?: number;
    endDate?: number;
    eventType?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    const queryParams = new URLSearchParams();

    // Validate and sanitize parameters
    if (params?.startDate) {
      const startDate = Number(params.startDate);
      if (isNaN(startDate) || startDate < 0) {
        throw new Error('Invalid startDate: must be a positive number');
      }
      queryParams.set('start', startDate.toString());
    }

    if (params?.endDate) {
      const endDate = Number(params.endDate);
      if (isNaN(endDate) || endDate < 0) {
        throw new Error('Invalid endDate: must be a positive number');
      }
      queryParams.set('end', endDate.toString());
    }

    if (params?.eventType) {
      // Validate eventType - only allow alphanumeric and underscores
      if (!/^[a-zA-Z0-9_]+$/.test(params.eventType)) {
        throw new Error('Invalid eventType: contains invalid characters');
      }
      queryParams.set('type', params.eventType);
    }

    if (params?.limit) {
      const limit = Number(params.limit);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        throw new Error('Invalid limit: must be between 1 and 1000');
      }
      queryParams.set('limit', limit.toString());
    }

    const data = await this.fetch<{ logs: AuditLog[] }>(
      `/v1/logs?${queryParams.toString()}`
    );
    return data.logs;
  }

  // Get statistics for dashboard
  async getStats(days: number = 7): Promise<DashboardStats> {
    // Validate days parameter
    const daysNum = Number(days);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      throw new Error('Invalid days: must be between 1 and 365');
    }

    const data = await this.fetch<{ stats: DashboardStats }>(
      `/v1/stats?days=${daysNum}`
    );
    return data.stats;
  }

  // Fetch all custom patterns (user's personal patterns)
  async getPatterns(): Promise<CustomPattern[]> {
    // Check cache first
    const cached = await apiCache.getPatterns<CustomPattern[]>();
    if (cached !== null) {
      return cached;
    }

    const data = await this.fetch<{ patterns: CustomPattern[] }>(
      '/v1/patterns'
    );

    // Cache the result
    await apiCache.setPatterns(data.patterns);

    return data.patterns;
  }

  // Create a new pattern
  async createPattern(pattern: {
    name: string;
    pattern: string;
    pattern_type: string;
    description?: string;
  }): Promise<CustomPattern> {
    const data = await this.fetch<{ success: boolean; pattern: CustomPattern }>(
      '/v1/patterns',
      {
        method: 'POST',
        body: JSON.stringify(pattern),
      }
    );

    // Invalidate patterns cache
    await apiCache.invalidatePatterns();

    return data.pattern;
  }

  // Update a pattern
  async updatePattern(
    patternId: string,
    updates: Partial<CustomPattern>
  ): Promise<void> {
    const safeId = this.validateId(patternId);
    await this.fetch(`/v1/patterns/${safeId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    // Invalidate patterns cache
    await apiCache.invalidatePatterns();
  }

  // Delete a pattern
  async deletePattern(patternId: string): Promise<void> {
    const safeId = this.validateId(patternId);
    await this.fetch(`/v1/patterns/${safeId}`, {
      method: 'DELETE',
    });

    // Invalidate patterns cache
    await apiCache.invalidatePatterns();
  }

  // Log a detection event
  async logEvent(event: {
    event_type: string;
    domain: string;
    pii_type: string;
    was_anonymized?: boolean;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.fetch('/v1/log', {
        method: 'POST',
        body: JSON.stringify(event),
      });
    } catch (error) {
      // Don't fail if logging fails
      console.warn('Failed to log event:', error);
    }
  }

  // Get user info
  async getUserInfo(): Promise<{
    id: string;
    email: string;
    subscription_tier: string;
    subscription_status: string;
  }> {
    return this.fetch('/v1/user');
  }

  // Refresh authentication token - accepts expired tokens and issues a new one
  async refreshToken(): Promise<{
    token: string;
    expiresAt: string;
    expiresIn: number;
  }> {
    return this.fetch('/v1/auth/token/refresh', { method: 'POST' });
  }

  // Validate authentication token
  async validateToken(): Promise<{
    valid: boolean;
    user?: {
      id: string;
      email: string;
      subscription_tier: string;
      subscription_status: string;
    };
    error?: string;
  }> {
    try {
      const user = await this.getUserInfo();
      return {
        valid: true,
        user,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid or expired authentication token',
      };
    }
  }

  async logDetection(detection: {
    type: string;
    domain: string;
    action?: 'detected' | 'blocked' | 'anonymized';
    metadata?: Record<string, any>;
    team_id?: string | null;
  }): Promise<void> {
    try {
      await this.fetch('/v1/detections', {
        method: 'POST',
        body: JSON.stringify(detection),
      });
    } catch (error) {
      console.warn('Failed to log detection:', error);
    }
  }

  async logDetectionsBatch(
    detections: Array<{
      type: string;
      domain: string;
      action?: 'detected' | 'blocked' | 'anonymized';
      metadata?: Record<string, any>;
      team_id?: string | null;
    }>
  ): Promise<void> {
    try {
      await this.fetch('/v1/detections/batch', {
        method: 'POST',
        body: JSON.stringify({ detections }),
      });
    } catch (error) {
      console.warn('Failed to log detections batch:', error);
    }
  }

  // Team methods
  async getTeams(): Promise<Team[]> {
    try {
      // Check cache first
      const cached = await apiCache.getTeams<Team[]>();
      if (cached !== null) {
        return cached;
      }

      const data = await this.fetch<{ teams: Team[] }>('/v1/teams');

      // Cache the result
      await apiCache.setTeams(data.teams);

      return data.teams;
    } catch (error) {
      console.warn('Failed to fetch teams:', error);
      return [];
    }
  }

  // Team policy methods
  async getTeamPolicies(teamId: string): Promise<TeamPolicy[]> {
    try {
      const safeId = this.validateId(teamId);

      // Check cache first
      const cached = await apiCache.getTeamPolicies<TeamPolicy[]>(safeId);
      if (cached !== null) {
        return cached;
      }

      const data = await this.fetch<{ policies: TeamPolicy[] }>(
        `/v1/teams/${safeId}/policies`
      );
      // Parse policy_data if it's a string with error handling
      const policies = data.policies.map(policy => {
        try {
          return {
            ...policy,
            policy_data:
              typeof policy.policy_data === 'string'
                ? JSON.parse(policy.policy_data)
                : policy.policy_data,
          };
        } catch (parseError) {
          console.warn('Failed to parse policy_data:', parseError);
          // Return policy with original policy_data if parsing fails
          return policy;
        }
      });

      // Cache the result
      await apiCache.setTeamPolicies(safeId, policies);

      return policies;
    } catch (error) {
      console.warn('Failed to fetch team policies:', error);
      return [];
    }
  }
}

// Singleton instance
let apiClient: PasteProofApiClient | null = null;

export function getApiClient(): PasteProofApiClient | null {
  return apiClient;
}

export function initializeApiClient(apiKey: string): PasteProofApiClient {
  apiClient = new PasteProofApiClient({
    apiKey,
    baseUrl: API_BASE_URL,
  });
  return apiClient;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function clearApiClient(): Promise<void> {
  apiClient = null;
  // Clear all cached data on logout
  await apiCache.clearAll();
}

// Re-export cache for direct invalidation when needed
export { apiCache } from './api-cache';
