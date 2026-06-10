import type { ApiEnvelope, AuthSession, HealthResponse, OnboardingState } from "@markos/shared-types";

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

  async register(input: {
    email: string;
    password: string;
    fullName: string;
    workspaceName?: string;
    locale?: "ar" | "en";
  }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/register", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/login", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async onboarding(): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>("/v1/onboarding");
    return response.data;
  }

  async saveOnboardingModule(module: string, body: Record<string, unknown>): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>(`/v1/onboarding/${module}`, {
      body,
      method: "PUT"
    });
    return response.data;
  }

  async completeOnboarding(): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>("/v1/onboarding/complete", {
      body: {},
      method: "POST"
    });
    return response.data;
  }

  private async request<TData>(
    path: string,
    options: { body?: Record<string, unknown>; method?: "GET" | "POST" | "PUT" } = {}
  ): Promise<ApiEnvelope<TData>> {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (this.accessToken !== undefined) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    if (this.workspaceId !== undefined) {
      headers["X-Workspace-Id"] = this.workspaceId;
    }

    const init: RequestInit = {
      headers,
      method: options.method ?? "GET"
    };

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, init);

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
      throw new Error(body?.error?.message ?? `MARKOS API request failed: ${response.status}`);
    }

    return (await response.json()) as ApiEnvelope<TData>;
  }
}
