import { z } from 'zod';

import { identityOutboxJobSchema } from './identity';
import { platformOutboxJobSchema } from './platform';

export const outboxJobSchema = z.union([platformOutboxJobSchema, identityOutboxJobSchema]);

export type OutboxJob = z.infer<typeof outboxJobSchema>;
