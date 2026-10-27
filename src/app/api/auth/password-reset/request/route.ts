import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceAuthRateLimit, requestPasswordReset, toPublicAuthError } from '@/lib/auth';
import { normalizeEmail } from '@/lib/auth-crypto';

export const runtime = 'nodejs';

const schema = z.object({ email: z.email().max(254) });

function clientAddress(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await enforceAuthRateLimit({
      action: 'reset',
      identity: `${clientAddress(request)}:${normalizeEmail(input.email)}`,
      limit: 5,
      windowMinutes: 60,
    });
    await requestPasswordReset(input.email, new URL(request.url).origin);
    return NextResponse.json({ message: '如果该邮箱已注册，重置邮件已经发送。' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '请输入有效的邮箱。' }, { status: 400 });
    }
    const publicError = toPublicAuthError(error, '重置邮件服务暂不可用，请稍后再试。');
    if (publicError.status >= 500) console.error('Password reset request failed.', error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
