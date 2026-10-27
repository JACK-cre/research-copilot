import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceAuthRateLimit, registerUser, toPublicAuthError } from '@/lib/auth';
import { normalizeEmail } from '@/lib/auth-crypto';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.email().max(254),
  password: z.string()
    .min(10, '密码至少需要 10 个字符。')
    .max(200)
    .regex(/[A-Za-z]/, '密码必须包含字母。')
    .regex(/[0-9]/, '密码必须包含数字。'),
  displayName: z.string().trim().min(1).max(80).optional(),
  inviteCode: z.string().trim().max(200).optional(),
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
      action: 'register',
      identity: `${clientAddress(request)}:${normalizeEmail(input.email)}`,
      limit: 5,
      windowMinutes: 60,
    });
    return NextResponse.json({ user: await registerUser(input) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? '注册信息不符合要求。' },
        { status: 400 },
      );
    }
    const publicError = toPublicAuthError(error, '注册服务暂不可用，请稍后再试。');
    if (publicError.status >= 500) console.error('Registration failed.', error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
