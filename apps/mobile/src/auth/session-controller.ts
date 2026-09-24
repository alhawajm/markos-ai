import type { AuthSession, NativeAuthSession, Locale } from "@markos/shared-types";
import { MarkosApiError } from "@markos/api-client";

export interface CredentialStore {
  read(): Promise<string | null>;
  write(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}
export interface SessionTransport {
  verifyMfa(code: string, accessToken: string): Promise<NativeAuthSession>;
  register(input: {
    email: string;
    password: string;
    fullName: string;
    workspaceName?: string;
    locale: Locale;
    acceptedTerms: true;
    policyVersion: string;
  }): Promise<NativeAuthSession>;
  login(input: { email: string; password: string; totpCode?: string }): Promise<NativeAuthSession>;
  refresh(refreshToken: string): Promise<NativeAuthSession>;
  logout(refreshToken: string): Promise<void>;
}
export type SessionState = {
  status: "loading" | "signedOut" | "signedIn" | "offline";
  session: AuthSession | null;
};

export class SessionChangedError extends Error {
  constructor() {
    super("Session changed");
    this.name = "AbortError";
  }
}

/** Serializes rotation and secure writes; late responses cannot restore a logged-out session. */
export class SessionController {
  private state: SessionState = { status: "loading", session: null };
  private listeners = new Set<() => void>();
  private refreshToken: string | null = null;
  private renewal: Promise<string> | undefined;
  private stepUp: Promise<void> | undefined;
  private writes: Promise<void> = Promise.resolve();
  private epoch = 0;

  constructor(
    private store: CredentialStore,
    private transport: SessionTransport
  ) {}
  getSnapshot = (): SessionState => this.state;
  getEpoch = (): number => this.epoch;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async restore(): Promise<void> {
    const epoch = this.epoch;
    this.emit({ status: "loading", session: null });
    try {
      const token = await this.store.read();
      this.assertEpoch(epoch);
      if (!token) {
        this.emit({ status: "signedOut", session: null });
        return;
      }
      this.refreshToken = token;
      await this.renew();
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (terminal(error)) await this.expire();
      else this.emit({ status: "offline", session: null });
    }
  }

  async login(input: Parameters<SessionTransport["login"]>[0]): Promise<void> {
    const epoch = ++this.epoch;
    this.renewal = undefined;
    this.stepUp = undefined;
    const grant = await this.transport.login(input);
    await this.accept(grant, epoch);
  }
  async register(input: Parameters<SessionTransport["register"]>[0]): Promise<void> {
    const epoch = ++this.epoch;
    this.renewal = undefined;
    this.stepUp = undefined;
    const grant = await this.transport.register(input);
    await this.accept(grant, epoch);
  }

  verifyMfa = (code: string): Promise<void> => {
    if (this.stepUp) return this.stepUp;
    const epoch = this.epoch;
    const previousRenewal = this.renewal;
    const operation = (async () => {
      await previousRenewal;
      this.assertEpoch(epoch);
      const current = this.state.session;
      if (!current) throw new SessionChangedError();
      let grant: NativeAuthSession;
      try {
        grant = await this.transport.verifyMfa(code, current.tokens.accessToken);
      } catch (error) {
        this.assertEpoch(epoch);
        if (!(error instanceof MarkosApiError) || error.code !== "INVALID_TOKEN" || !this.refreshToken) throw error;
        // This operation owns rotation: renew once without recursively joining itself.
        try {
          const refreshed = await this.transport.refresh(this.refreshToken);
          if (refreshed.user.id !== current.user.id || refreshed.workspace.id !== current.workspace.id)
            throw new MarkosApiError("Session identity changed", 401, "INVALID_REFRESH_TOKEN");
          await this.accept(refreshed, epoch);
          grant = await this.transport.verifyMfa(code, refreshed.tokens.accessToken);
        } catch (retryError) {
          if (epoch === this.epoch && terminal(retryError)) await this.expire();
          throw retryError;
        }
      }
      if (grant.user.id !== current.user.id || grant.workspace.id !== current.workspace.id) throw new SessionChangedError();
      await this.accept(grant, epoch);
      return grant.tokens.accessToken;
    })();
    this.renewal = operation;
    const step = operation.then(() => {});
    this.stepUp = step;
    void step
      .finally(() => {
        if (this.renewal === operation) this.renewal = undefined;
        if (this.stepUp === step) this.stepUp = undefined;
      })
      .catch(() => {});
    return step;
  };

  renew = (): Promise<string> => {
    if (this.renewal) return this.renewal;
    const epoch = this.epoch;
    const token = this.refreshToken;
    if (!token) return Promise.reject(new MarkosApiError("Session expired", 401, "INVALID_REFRESH_TOKEN"));
    const operation = (async () => {
      try {
        const grant = await this.transport.refresh(token);
        const previous = this.state.session;
        if (previous && (previous.user.id !== grant.user.id || previous.workspace.id !== grant.workspace.id)) {
          throw new MarkosApiError("Session identity changed", 401, "INVALID_REFRESH_TOKEN");
        }
        await this.accept(grant, epoch);
        return grant.tokens.accessToken;
      } catch (error) {
        if (epoch === this.epoch && terminal(error)) await this.expire();
        throw error;
      }
    })();
    this.renewal = operation;
    void operation
      .finally(() => {
        if (this.renewal === operation) this.renewal = undefined;
      })
      .catch(() => {});
    return operation;
  };

  async logout(): Promise<void> {
    const token = this.refreshToken;
    await this.expire();
    if (token) await this.transport.logout(token).catch(() => {});
  }

  expire = async (): Promise<void> => {
    ++this.epoch;
    this.refreshToken = null;
    this.renewal = undefined;
    this.stepUp = undefined;
    this.emit({ status: "signedOut", session: null });
    await this.queueWrite(() => this.store.clear());
  };

  assertEpoch(epoch: number): void {
    if (epoch !== this.epoch) throw new SessionChangedError();
  }

  private async accept(grant: NativeAuthSession, epoch: number): Promise<void> {
    this.assertEpoch(epoch);
    await this.queueWrite(async () => {
      this.assertEpoch(epoch);
      await this.store.write(grant.tokens.refreshToken);
    });
    this.assertEpoch(epoch);
    this.refreshToken = grant.tokens.refreshToken;
    const session: AuthSession = { ...grant, tokens: { accessToken: grant.tokens.accessToken, expiresIn: grant.tokens.expiresIn } };
    this.emit({ status: "signedIn", session });
  }

  private queueWrite(write: () => Promise<void>): Promise<void> {
    const operation = this.writes.catch(() => {}).then(write);
    this.writes = operation;
    return operation;
  }
  private emit(state: SessionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}

function terminal(error: unknown): boolean {
  return (
    error instanceof MarkosApiError &&
    ["INVALID_REFRESH_TOKEN", "REFRESH_TOKEN_REUSE_DETECTED", "MFA_REQUIRED", "MFA_SETUP_REQUIRED"].includes(error.code ?? "")
  );
}
