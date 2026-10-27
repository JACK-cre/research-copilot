import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceAuthRateLimit, loginUser, toPublicAuthError } from '@/lib/auth';
import { normalizeEmail } from '@/lib/auth-crypto';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

function clientAddress(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await enforceAuthRateLimit({
      action: 'login',
      identity: `${clientAddress(request)}:${normalizeEmail(input.email)}`,
      limit: 10,
      windowMinutes: 15,
    });
    return NextResponse.json({ user: await loginUser(input.email, input.password) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '请输入有效的邮箱和密码。' }, { status: 400 });
    }
    const publicError = toPublicAuthError(error, '登录服务暂不可用，请稍后再试。');
    if (publicError.status >= 500) console.error('Login failed.', error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
