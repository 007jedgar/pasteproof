// src/shared/api-client.ts
import { CustomPattern } from './pii-detector';

const API_BASE_URL = 'https://api.pasteproof.com'; // Production API base URL

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

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

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
      throw new Error(error.error || `API error: ${response.status}`);
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

  async addToWhitelist(domain: string): Promise<WhitelistSite> {
    const data = await this.fetch<{
      success: boolean;
      whitelist: WhitelistSite;
    }>('/v1/whitelist', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    });
    return data.whitelist;
  }

  async removeFromWhitelist(whitelistId: string): Promise<void> {
    await this.fetch(`/v1/whitelist/${whitelistId}`, {
      method: 'DELETE',
    });
  }

  async isWhitelisted(domain: string): Promise<boolean> {
    const data = await this.fetch<{ whitelisted: boolean; domain: string }>(
      `/v1/whitelist/check/${encodeURIComponent(domain)}`
    );
    return data.whitelisted;
  }

  // AI Context Analysis
  async analyzeContext(
    text: string,
    context?: string
  ): Promise<AiAnalysisResult> {
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
      body: JSON.stringify({ text, context }),
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
    if (params?.startDate)
      queryParams.set('start', params.startDate.toString());
    if (params?.endDate) queryParams.set('end', params.endDate.toString());
    if (params?.eventType) queryParams.set('type', params.eventType);
    if (params?.limit) queryParams.set('limit', params.limit.toString());

    const data = await this.fetch<{ logs: AuditLog[] }>(
      `/v1/logs?${queryParams.toString()}`
    );
    return data.logs;
  }

  // Get statistics for dashboard
  async getStats(days: number = 7): Promise<DashboardStats> {
    const data = await this.fetch<{ stats: DashboardStats }>(
      `/v1/stats?days=${days}`
    );
    return data.stats;
  }

  // Fetch all custom patterns (user's personal patterns)
  async getPatterns(): Promise<CustomPattern[]> {
    const data = await this.fetch<{ patterns: CustomPattern[] }>(
      '/v1/patterns'
    );
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
    return data.pattern;
  }

  // Update a pattern
  async updatePattern(
    patternId: string,
    updates: Partial<CustomPattern>
  ): Promise<void> {
    await this.fetch(`/v1/patterns/${patternId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Delete a pattern
  async deletePattern(patternId: string): Promise<void> {
    await this.fetch(`/v1/patterns/${patternId}`, {
      method: 'DELETE',
    });
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
      const data = await this.fetch<{ teams: Team[] }>('/v1/teams');
      return data.teams;
    } catch (error) {
      console.warn('Failed to fetch teams:', error);
      return [];
    }
  }

  // Team policy methods
  async getTeamPolicies(teamId: string): Promise<TeamPolicy[]> {
    try {
      const data = await this.fetch<{ policies: TeamPolicy[] }>(
        `/v1/teams/${teamId}/policies`
      );
      // Parse policy_data if it's a string
      return data.policies.map(policy => ({
        ...policy,
        policy_data:
          typeof policy.policy_data === 'string'
            ? JSON.parse(policy.policy_data)
            : policy.policy_data,
      }));
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
  apiClient = new PasteProofApiClient({ apiKey });
  return apiClient;
}

export function clearApiClient(): void {
  apiClient = null;
}
