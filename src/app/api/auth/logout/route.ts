import { NextResponse } from 'next/server';

import { logoutCurrentSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  try {
    await logoutCurrentSession();
    return NextResponse.json({ signedOut: true });
  } catch (error) {
    console.error('Session revocation failed.', error);
    return NextResponse.json({ signedOut: true });
  }
}
