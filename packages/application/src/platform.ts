import type { PlatformProbeCommand, PlatformProbeResult } from '@delivery-os/contracts';

import { ApplicationError } from './errors';

export interface PlatformCommandStore {
  execute(command: PlatformProbeCommand): Promise<PlatformProbeResult>;
}

export class RecordPlatformProbe {
  constructor(private readonly store: PlatformCommandStore) {}

  async execute(command: PlatformProbeCommand): Promise<PlatformProbeResult> {
    if (command.authorization.workspaceRole !== 'ADMIN') {
      throw new ApplicationError({
        code: 'FORBIDDEN',
        message: 'The requested operation is not permitted.',
        correlationId: command.correlationId,
      });
    }

    return this.store.execute(command);
  }
}
