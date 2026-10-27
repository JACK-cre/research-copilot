'use client';

import { FlaskConical, LoaderCircle, LockKeyhole } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';

import { ResearchWorkbench } from '@/components/research-workbench';

interface ResearchAppProps {
  cloudEnabled: boolean;
}

interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

type RegistrationMode = 'open' | 'invite' | 'closed';

export function ResearchApp({ cloudEnabled }: ResearchAppProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('open');
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(false);
  const [loading, setLoading] = useState(cloudEnabled);
  const [loadError, setLoadError] = useState('');

  const loadSession = useCallback(async () => {
    if (!cloudEnabled) return;
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '登录服务暂不可用。');
      setUser(payload.user ?? null);
      setRegistrationMode(payload.registrationMode ?? 'open');
      setPasswordResetEnabled(Boolean(payload.passwordResetEnabled));
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '登录服务暂不可用。');
    } finally {
      setLoading(false);
    }
  }, [cloudEnabled]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  if (!cloudEnabled) return <ResearchWorkbench />;
  if (loading) return <AuthLoading />;
  if (!user) {
    return <AuthScreen
      initialError={loadError}
      passwordResetEnabled={passwordResetEnabled}
      registrationMode={registrationMode}
      onAuthenticated={setUser}
    />;
  }

  return (
    <ResearchWorkbench
      cloudEnabled
      userEmail={user.email}
      onSignOut={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
      }}
    />
  );
}

function AuthLoading() {
  return <main className="auth-shell"><div className="auth-loading"><LoaderCircle className="spin" size={24} /><span>正在恢复安全会话</span></div></main>;
}

function AuthScreen({
  registrationMode,
  passwordResetEnabled,
  initialError,
  onAuthenticated,
}: {
  registrationMode: RegistrationMode;
  passwordResetEnabled: boolean;
  initialError: string;
  onAuthenticated: (user: SessionUser) => void;
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(initialError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      if (mode === 'forgot') {
        const response = await fetch('/api/auth/password-reset/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || '重置邮件发送失败。');
        setMessage(payload.message);
        return;
      }
      const response = await fetch(mode === 'signin' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || undefined,
          inviteCode: inviteCode || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || (mode === 'signin' ? '登录失败。' : '注册失败。'));
      onAuthenticated(payload.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败，请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  const signupAvailable = registrationMode !== 'closed';
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand"><span><FlaskConical size={21} /></span><div><strong>Research Copilot</strong><small>私有研究工作台</small></div></div>
        <div className="auth-heading"><LockKeyhole size={20} /><h1>{mode === 'signin' ? '登录工作空间' : mode === 'signup' ? '创建研究账户' : '找回账户密码'}</h1><p>{mode === 'forgot' ? '输入注册邮箱，我们会发送一个 30 分钟内有效的重置链接。' : '论文、知识库和研究成品仅对你的工作空间成员可见。'}</p></div>
        <form onSubmit={submit}>
          {mode === 'signup' ? <label><span>显示名称</span><input autoComplete="name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="你的名称" /></label> : null}
          <label><span>邮箱</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {mode !== 'forgot' ? <label><span>密码</span><input type="password" minLength={mode === 'signup' ? 10 : 1} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label> : null}
          {mode === 'signup' && registrationMode === 'invite' ? <label><span>邀请码</span><input autoComplete="off" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required /></label> : null}
          {mode === 'signup' ? <p className="auth-hint">密码至少 10 位，并同时包含字母和数字。</p> : null}
          {mode === 'signin' && passwordResetEnabled ? <button className="field-link" type="button" onClick={() => { setMode('forgot'); setMessage(''); }}>忘记密码</button> : null}
          {message ? <div className="auth-message">{message}</div> : null}
          <button className="button primary auth-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : null}{mode === 'signin' ? '登录' : mode === 'signup' ? '注册并进入' : '发送重置链接'}</button>
        </form>
        {mode === 'forgot' ? <button className="auth-switch" onClick={() => { setMode('signin'); setMessage(''); }}>返回登录</button> : signupAvailable ? <button className="auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}>{mode === 'signin' ? '没有账户？创建一个' : '返回登录'}</button> : <p className="auth-closed">当前仅允许已有用户登录。</p>}
      </section>
    </main>
  );
}
