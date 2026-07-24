import { describe, expect, it } from 'vitest';

import { CommandDispatcher } from './dispatch';

describe('CommandDispatcher', () => {
  it('dispatches a registered command and rejects duplicate registration', async () => {
    const dispatcher = new CommandDispatcher();
    const command = {
      execute(input: unknown) {
        return Promise.resolve({ input });
      },
    };
    dispatcher.register('example', command);

    await expect(
      dispatcher.dispatch<{ input: unknown }>('example', 'value', crypto.randomUUID()),
    ).resolves.toEqual({ input: 'value' });
    expect(() => dispatcher.register('example', command)).toThrow(/already registered/);
  });

  it('returns a stable application error for an unknown command', async () => {
    const dispatcher = new CommandDispatcher();
    await expect(dispatcher.dispatch('missing', {}, crypto.randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
