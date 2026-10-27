import { NextResponse } from 'next/server';

import { getDatabasePool } from '@/lib/db';
import { getDatabaseUrl, isCloudPlatformConfigured } from '@/lib/platform-config';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (isCloudPlatformConfigured()) {
      const result = await getDatabasePool().query<{ runs: string | null }>(
        "SELECT to_regclass('public.research_runs')::text AS runs",
      );
      if (!result.rows[0]?.runs) throw new Error('Supabase migration has not been applied.');
    } else if (getDatabaseUrl()) await getDatabasePool().query('SELECT 1');
    else await getVectorStore().listDocuments();
    return NextResponse.json({
      status: 'ok',
      mode: isCloudPlatformConfigured() ? 'cloud' : 'legacy',
      storage: getDatabaseUrl() ? 'pgvector' : 'local',
      ai: process.env.OPENAI_API_KEY ? 'model' : 'local',
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
