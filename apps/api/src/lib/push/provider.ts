export interface PushMessage {
  title: string;
  body: string;
  // Deep-link payload (F16: "cada notificación abre la pantalla
  // correspondiente") — the mobile client reads this to navigate.
  data: Record<string, string>;
}

export interface PushSendResult {
  // The provider reported the token as unregistered/invalid — the caller
  // (NotificationService) deletes the device row (F16: "limpiar tokens
  // inválidos al recibir error del proveedor").
  invalidToken: boolean;
}

/**
 * D-06: interface decoupled from any concrete push service, mirroring
 * LlmProvider's D-04 split — NotificationService only depends on this.
 * FakePushProvider is a fixture-free in-memory recorder for dev/test;
 * FirebasePushProvider (FCM for Android, APNs via FCM for iOS) is the real
 * adapter.
 */
export interface PushProvider {
  send(pushToken: string, message: PushMessage): Promise<PushSendResult>;
}

export class PushProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushProviderError';
  }
}
