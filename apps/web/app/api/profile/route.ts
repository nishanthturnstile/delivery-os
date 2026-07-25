import { UpdateProfile } from '@delivery-os/application';
import { updateProfileCommandSchema } from '@delivery-os/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { identityStore } from '@/lib/auth';

export async function PATCH(request: NextRequest) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const body: unknown = await request.json();
    const command = updateProfileCommandSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      schemaVersion: '1',
      actorId: authContext.session.user.id,
      correlationId,
    });
    await new UpdateProfile(identityStore).execute(command);
    return NextResponse.json({ schemaVersion: '1', correlationId });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
