import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import {
  PushProviderError,
  type PushMessage,
  type PushProvider,
  type PushSendResult,
} from './provider.js';

// FCM error codes that mean "this token will never work again" — the ones
// worth cleaning up (F16: "limpiar tokens inválidos al recibir error del
// proveedor"). Anything else (network, quota, server errors) is a real
// failure and propagates.
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * D-06: real adapter — FCM for Android, APNs via FCM for iOS (same API on
 * both, per the spec's choice to avoid a separate APNs integration).
 */
export class FirebasePushProvider implements PushProvider {
  private app: App;

  constructor(serviceAccountJson: string) {
    let credentials: object;
    try {
      credentials = JSON.parse(serviceAccountJson) as object;
    } catch {
      throw new PushProviderError('FCM_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
    this.app = initializeApp({ credential: cert(credentials) }, 'copiloto-push');
  }

  async send(pushToken: string, message: PushMessage): Promise<PushSendResult> {
    try {
      await getMessaging(this.app).send({
        token: pushToken,
        notification: { title: message.title, body: message.body },
        data: message.data,
      });
      return { invalidToken: false };
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      if (code && INVALID_TOKEN_CODES.has(code)) {
        return { invalidToken: true };
      }
      throw new PushProviderError(
        `FCM send failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
