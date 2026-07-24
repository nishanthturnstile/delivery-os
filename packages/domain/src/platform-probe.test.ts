import { describe, expect, it } from 'vitest';

import { recordPlatformProbe } from './platform-probe';

describe('recordPlatformProbe', () => {
  it('creates and advances a versioned aggregate', () => {
    const created = recordPlatformProbe(undefined, {
      id: 'probe',
      workspaceId: 'workspace',
      delta: 2,
    });
    const updated = recordPlatformProbe(created, {
      id: 'probe',
      workspaceId: 'workspace',
      delta: 3,
    });

    expect(updated).toEqual({
      id: 'probe',
      workspaceId: 'workspace',
      revision: 2,
      value: 5,
    });
  });

  it('rejects invalid deltas and identity changes', () => {
    expect(() =>
      recordPlatformProbe(undefined, { id: 'probe', workspaceId: 'workspace', delta: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      recordPlatformProbe(
        { id: 'probe', workspaceId: 'workspace', revision: 1, value: 1 },
        { id: 'other', workspaceId: 'workspace', delta: 1 },
      ),
    ).toThrow(/identity/);
  });
});
