import { z } from 'zod';

import { identityOutboxJobSchema } from './identity';
import { platformOutboxJobSchema } from './platform';
import { projectOutboxJobSchema } from './projects';

export const outboxJobSchema = z.union([
  platformOutboxJobSchema,
  identityOutboxJobSchema,
  projectOutboxJobSchema,
]);

export type OutboxJob = z.infer<typeof outboxJobSchema>;
