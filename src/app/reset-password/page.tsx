import { ResetPasswordForm } from '@/components/reset-password-form';
import { getSupabasePublicConfig, isSupabasePublicConfigured } from '@/lib/platform-config';

export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  if (!isSupabasePublicConfigured()) return <main className="auth-shell">Supabase 尚未配置。</main>;
  const config = getSupabasePublicConfig();
  return <ResetPasswordForm url={config.url} anonKey={config.anonKey} />;
}
