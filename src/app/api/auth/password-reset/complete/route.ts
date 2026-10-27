import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resetPassword, toPublicAuthError } from '@/lib/auth';

export const runtime = 'nodejs';

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string()
    .min(10, '密码至少需要 10 个字符。')
    .max(200)
    .regex(/[A-Za-z]/, '密码必须包含字母。')
    .regex(/[0-9]/, '密码必须包含数字。'),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await resetPassword(input.token, input.password);
    return NextResponse.json({ updated: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? '新密码不符合要求。' },
        { status: 400 },
      );
    }
    const publicError = toPublicAuthError(error, '密码更新服务暂不可用，请稍后再试。');
    if (publicError.status >= 500) console.error('Password reset failed.', error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
