export type EmailMessage = Readonly<{
  notificationId: string;
  to: string;
  subject: string;
  text: string;
  correlationId: string;
}>;

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}

export interface TelemetryExporter {
  readonly enabled: boolean;
  flush(): Promise<void>;
}
