import { describe, expect, it } from 'vitest';

import { DisabledAiWorkflow } from './index';

describe('provider-independent disabled AI workflow', () => {
  it('exposes immutable schemas and always fails closed to the manual path', async () => {
    const workflow = new DisabledAiWorkflow<{ synthetic: boolean }, { advisory: string }>();
    expect(workflow.workflowId).toBe('disabled');
    expect(workflow.inputSchemaVersion).toBe('1');
    expect(workflow.outputSchemaVersion).toBe('1');
    await expect(
      workflow.run(
        { synthetic: true },
        {
          workspaceId: 'synthetic-workspace',
          projectId: 'synthetic-project',
          correlationId: 'synthetic-correlation',
        },
      ),
    ).rejects.toThrow('AI assistance is disabled');
  });
});
