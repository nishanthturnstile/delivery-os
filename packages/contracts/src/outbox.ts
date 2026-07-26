import { z } from 'zod';

import { artifactOutboxJobSchema } from './artifacts';
import { identityOutboxJobSchema } from './identity';
import { sourceOutboxJobSchema } from './ingestion';
import { platformOutboxJobSchema } from './platform';
import { projectOutboxJobSchema } from './projects';

export const outboxJobSchema = z.union([
  artifactOutboxJobSchema,
  platformOutboxJobSchema,
  identityOutboxJobSchema,
  projectOutboxJobSchema,
  sourceOutboxJobSchema,
]);

export type OutboxJob = z.infer<typeof outboxJobSchema>;
