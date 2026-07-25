import { ApplicationError } from '@delivery-os/application';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { apiError, requireUser } from '@/lib/api';
import { auth, authPool } from '@/lib/auth';

export async function POST(request: NextRequest) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const body = (await request.json()) as { code?: unknown };
    if (typeof body.code !== 'string') {
      throw new ApplicationError({
        code: 'VALIDATION_FAILED',
        message: 'Enter the six-digit authenticator code.',
        correlationId,
      });
    }
    await auth.api.verifyTOTP({
      body: { code: body.code, trustDevice: false },
      headers: request.headers,
    });
    await authPool.query(
      `update auth_sessions set mfa_verified_at = now(), updated_at = now() where id = $1`,
      [authContext.session.session.id],
    );
    return NextResponse.json({
      schemaVersion: '1',
      mfaVerifiedAt: new Date().toISOString(),
      correlationId,
    });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
