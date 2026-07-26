export type ApprovedContext = Readonly<{
  workspaceId: string;
  projectId?: string;
  correlationId: string;
}>;

export type ValidatedGeneration<T> = Readonly<{
  data: T;
  provenance: Readonly<{ provider: string; workflowVersion: string }>;
  validation: readonly string[];
  citations: readonly string[];
  usage: Readonly<{ inputTokens?: number; outputTokens?: number; cost?: string }>;
}>;

export interface AiWorkflow<I, O> {
  readonly workflowId: string;
  readonly inputSchemaVersion: string;
  readonly outputSchemaVersion: string;
  run(input: I, context: ApprovedContext): Promise<ValidatedGeneration<O>>;
}

export class DisabledAiWorkflow<I, O> implements AiWorkflow<I, O> {
  readonly workflowId = 'disabled';
  readonly inputSchemaVersion = '1';
  readonly outputSchemaVersion = '1';

  run(input: I, context: ApprovedContext): Promise<ValidatedGeneration<O>> {
    void input;
    void context;
    return Promise.reject(new Error('AI assistance is disabled; use the manual workflow.'));
  }
}

export * from './requirement-extraction';
export * from './live-requirement-provider';
