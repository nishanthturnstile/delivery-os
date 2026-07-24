export type PlatformProbe = Readonly<{
  id: string;
  workspaceId: string;
  revision: number;
  value: number;
}>;

export function recordPlatformProbe(
  current: PlatformProbe | undefined,
  input: Readonly<{ id: string; workspaceId: string; delta: number }>,
): PlatformProbe {
  if (!Number.isSafeInteger(input.delta) || input.delta <= 0) {
    throw new RangeError('Probe delta must be a positive safe integer.');
  }

  if (current === undefined) {
    return {
      id: input.id,
      workspaceId: input.workspaceId,
      revision: 1,
      value: input.delta,
    };
  }

  if (current.id !== input.id || current.workspaceId !== input.workspaceId) {
    throw new Error('Probe identity cannot change.');
  }

  return {
    ...current,
    revision: current.revision + 1,
    value: current.value + input.delta,
  };
}
