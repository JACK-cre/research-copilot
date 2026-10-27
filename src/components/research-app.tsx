'use client';

import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { FlaskConical, Github, LoaderCircle, LockKeyhole } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { ResearchWorkbench } from '@/components/research-workbench';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

interface ResearchAppProps {
  cloudEnabled: boolean;
  githubAuthEnabled: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export function ResearchApp({ cloudEnabled, githubAuthEnabled, supabaseUrl, supabaseAnonKey }: ResearchAppProps) {
  const supabase = useMemo(
    () => cloudEnabled ? createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey) : null,
    [cloudEnabled, supabaseAnonKey, supabaseUrl],
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(cloudEnabled);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      setUser(data.user);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (!cloudEnabled) return <ResearchWorkbench />;
  if (loading) return <AuthLoading />;
  if (!user || !supabase) return <AuthScreen githubAuthEnabled={githubAuthEnabled} supabase={supabase} />;

  return (
    <ResearchWorkbench
      cloudEnabled
      userEmail={user.email}
      onSignOut={async () => {
        await supabase.auth.signOut();
        setUser(null);
      }}
    />
  );
}

function AuthLoading() {
  return <main className="auth-shell"><div className="auth-loading"><LoaderCircle className="spin" size={24} /><span>正在恢复安全会话</span></div></main>;
}

function AuthScreen({ githubAuthEnabled, supabase }: { githubAuthEnabled: boolean; supabase: SupabaseClient }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      if (mode === 'forgot') {
        const response = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/auth/callback?next=/reset-password',
        });
        if (response.error) throw response.error;
        setMessage('重置链接已发送，请检查邮箱。');
        return;
      }
      const response = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/auth/callback' } });
      if (response.error) throw response.error;
      if (mode === 'signup' && !response.data.session) {
        setMessage('注册成功，请打开邮箱中的验证链接后登录。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录失败，请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  async function signInWithGithub() {
    setPending(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin + '/auth/callback' },
    });
    if (error) {
      setMessage(error.message);
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand"><span><FlaskConical size={21} /></span><div><strong>Research Copilot</strong><small>私有研究工作台</small></div></div>
        <div className="auth-heading"><LockKeyhole size={20} /><h1>{mode === 'signin' ? '登录工作空间' : mode === 'signup' ? '创建研究账户' : '找回账户密码'}</h1><p>论文、知识库和研究成品仅对你的工作空间成员可见。</p></div>
        <form onSubmit={submit}>
          <label><span>邮箱</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {mode !== 'forgot' ? <label><span>密码</span><input type="password" minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label> : null}
          {mode === 'signin' ? <button className="field-link" type="button" onClick={() => { setMode('forgot'); setMessage(''); }}>忘记密码</button> : null}
          {message ? <div className="auth-message">{message}</div> : null}
          <button className="button primary auth-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : null}{mode === 'signin' ? '登录' : mode === 'signup' ? '注册' : '发送重置链接'}</button>
        </form>
        {githubAuthEnabled && mode !== 'forgot' ? <><div className="auth-divider"><span>或</span></div><button className="button secondary auth-github" disabled={pending} onClick={() => void signInWithGithub()}><Github size={17} />使用 GitHub 登录</button></> : null}
        <button className="auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}>{mode === 'signin' ? '没有账户？创建一个' : '返回登录'}</button>
      </section>
    </main>
  );
}
