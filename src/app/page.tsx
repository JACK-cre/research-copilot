import { ResearchApp } from '@/components/research-app';
import {
  getSupabasePublicConfig,
  isCloudPlatformConfigured,
} from '@/lib/platform-config';

export const dynamic = 'force-dynamic';

export default function Home() {
  const cloudEnabled = isCloudPlatformConfigured();
  const supabase = cloudEnabled ? getSupabasePublicConfig() : undefined;
  return (
    <ResearchApp
      cloudEnabled={cloudEnabled}
      githubAuthEnabled={process.env.NEXT_PUBLIC_GITHUB_AUTH_ENABLED === 'true'}
      supabaseUrl={supabase?.url}
      supabaseAnonKey={supabase?.anonKey}
    />
  );
}
