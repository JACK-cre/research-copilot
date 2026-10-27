import { NextResponse } from 'next/server';

import { getCurrentUser, getRegistrationMode, isPasswordResetEnabled } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({
      authenticated: Boolean(user),
      user,
      registrationMode: getRegistrationMode(),
      passwordResetEnabled: isPasswordResetEnabled(),
    });
  } catch (error) {
    console.error('Session lookup failed.', error);
    return NextResponse.json({ error: '登录服务暂不可用。' }, { status: 503 });
  }
}
