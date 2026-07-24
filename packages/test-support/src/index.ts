import type { EmailMessage, EmailProvider } from '@delivery-os/application';

export class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    this.sent.push(message);
    return Promise.resolve({ providerMessageId: `fake-${message.notificationId}` });
  }
}
