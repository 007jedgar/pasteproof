import { CustomPattern } from './pii-detector';

const API_BASE_URL = 'http://localhost:8787'; // Change to production URL later

export type ApiConfig = {
  apiKey: string;
  baseUrl?: string;
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

  // Fetch all custom patterns
  async getPatterns(): Promise<CustomPattern[]> {
    const data = await this.fetch<{ patterns: CustomPattern[] }>(
      '/api/patterns'
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
      '/api/patterns',
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
    await this.fetch(`/api/patterns/${patternId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Delete a pattern
  async deletePattern(patternId: string): Promise<void> {
    await this.fetch(`/api/patterns/${patternId}`, {
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
      await this.fetch('/api/log', {
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
    return this.fetch('/api/user');
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
