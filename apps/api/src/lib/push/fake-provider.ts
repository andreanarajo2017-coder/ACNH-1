import type { PushMessage, PushProvider, PushSendResult } from './provider.js';

export interface SentPush {
  pushToken: string;
  message: PushMessage;
}

/**
 * D-06 dev/test fallback (never in production, mirrors FakeProvider's D-04
 * rule) — records every send in memory instead of calling FCM. Tests mark a
 * token invalid up front to exercise the "clean up invalid tokens" path
 * (F16) without a real provider error.
 */
export class FakePushProvider implements PushProvider {
  public sent: SentPush[] = [];
  private invalidTokens = new Set<string>();

  markInvalid(pushToken: string): void {
    this.invalidTokens.add(pushToken);
  }

  async send(pushToken: string, message: PushMessage): Promise<PushSendResult> {
    this.sent.push({ pushToken, message });
    return { invalidToken: this.invalidTokens.has(pushToken) };
  }
}
