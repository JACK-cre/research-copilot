import { ResearchApp } from '@/components/research-app';
import { isHostedPlatformConfigured } from '@/lib/platform-config';

export const dynamic = 'force-dynamic';

export default function Home() {
  return <ResearchApp cloudEnabled={isHostedPlatformConfigured()} />;
}
