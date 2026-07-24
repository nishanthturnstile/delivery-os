import type { EmailMessage, EmailProvider } from '@delivery-os/application';
import { Resend } from 'resend';

export class ResendEmailProvider implements EmailProvider {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    const response = await this.resend.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        headers: {
          'X-Delivery-OS-Correlation-ID': message.correlationId,
          'X-Delivery-OS-Notification-ID': message.notificationId,
        },
      },
      { idempotencyKey: message.notificationId },
    );
    if (response.error !== null) {
      throw new Error('EMAIL_PROVIDER_REJECTED');
    }
    return { providerMessageId: response.data.id };
  }
}
