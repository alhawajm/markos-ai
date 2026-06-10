import type { ApiEnvelope, HealthResponse } from "@markos/shared-types";

export interface MarkosApiClientOptions {
  baseUrl: string;
  accessToken?: string;
  workspaceId?: string;
}

export class MarkosApiClient {
  private readonly baseUrl: string;
  private readonly accessToken: string | undefined;
  private readonly workspaceId: string | undefined;

  constructor(options: MarkosApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.accessToken = options.accessToken;
    this.workspaceId = options.workspaceId;
  }

  async health(): Promise<HealthResponse> {
    const response = await this.request<HealthResponse>("/v1/health");
    return response.data;
  }

  private async request<TData>(path: string): Promise<ApiEnvelope<TData>> {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };

    if (this.accessToken !== undefined) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    if (this.workspaceId !== undefined) {
      headers["X-Workspace-Id"] = this.workspaceId;
    }

    const response = await fetch(`${this.baseUrl}${path}`, { headers });

    if (!response.ok) {
      throw new Error(`MARKOS API request failed: ${response.status}`);
    }

    return (await response.json()) as ApiEnvelope<TData>;
  }
}
