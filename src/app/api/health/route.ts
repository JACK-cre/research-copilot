import { NextResponse } from 'next/server';

import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getVectorStore().listDocuments();
    return NextResponse.json({
      status: 'ok',
      storage: process.env.DATABASE_URL ? 'pgvector' : 'local',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed.', error);
    return NextResponse.json(
      { status: 'unavailable', storage: 'pgvector' },
      { status: 503 },
    );
  }
}
