import { describe, expect, it } from 'vitest';

import { AiProvenanceCipher } from './ai-store';

describe('AI provenance encryption', () => {
  const key = Buffer.alloc(32, 11).toString('base64');

  it('round-trips encrypted synthetic payloads with bound associated data', () => {
    const cipher = new AiProvenanceCipher(key);
    const payload = {
      prompt: { blockIds: ['synthetic-block'] },
      output: { claims: ['synthetic-claim'] },
    };
    const ciphertext = cipher.encrypt(payload, 'workspace:project:generation:input:output');

    expect(ciphertext).not.toContain('synthetic');
    expect(cipher.decrypt(ciphertext, 'workspace:project:generation:input:output')).toEqual(
      payload,
    );
    expect(() => cipher.decrypt(ciphertext, 'different-associated-data')).toThrow();
  });

  it('rejects malformed keys and ciphertext envelopes', () => {
    expect(() => new AiProvenanceCipher('not-a-32-byte-base64-key')).toThrow(
      'AI_PROVENANCE_KEY_INVALID',
    );
    const cipher = new AiProvenanceCipher(key);
    for (const malformed of ['v2.a.b.c', 'v1.a.b', 'v1.a.b.c.extra']) {
      expect(() => cipher.decrypt(malformed, 'synthetic-associated-data')).toThrow(
        'AI_PROVENANCE_CIPHERTEXT_INVALID',
      );
    }
  });
});
