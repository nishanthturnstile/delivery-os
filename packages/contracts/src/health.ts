import { z } from 'zod';

const dependencyStateSchema = z.object({
  name: z.string(),
  status: z.enum(['up', 'down', 'disabled']),
  latencyMs: z.number().nonnegative().optional(),
  message: z.string().max(160).optional(),
});

export const healthResponseSchema = z.object({
  schemaVersion: z.literal('1'),
  status: z.enum(['ok', 'degraded']),
  service: z.string().min(1),
  version: z.string().min(1),
  timestamp: z.iso.datetime(),
  correlationId: z.uuid(),
  dependencies: z.array(dependencyStateSchema).optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
