// D-09: Mailer adapter — console output in dev, a real provider is chosen
// later (Q-05). Callers never touch a transport directly.
export interface Mailer {
  sendPasswordReset(params: { to: string; resetToken: string }): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async sendPasswordReset(params: { to: string; resetToken: string }): Promise<void> {
    // Never log the recipient's email or the token in production logging —
    // this direct console write is the dev-only "provider".
    console.log(`[dev-mailer] password reset for ${params.to}: token=${params.resetToken}`);
  }
}
