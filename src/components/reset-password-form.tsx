'use client';

import { Check, LoaderCircle, LockKeyhole } from 'lucide-react';
import { FormEvent, useState } from 'react';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(token ? '' : '重置链接缺少安全令牌。');
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/password-reset/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '密码更新失败。');
      setComplete(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '密码更新失败。');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-heading"><LockKeyhole size={20} /><h1>设置新密码</h1><p>新密码至少 10 位，并同时包含字母和数字。</p></div>
        {complete ? <div className="reset-complete"><Check size={20} /><strong>密码已更新</strong><a className="button primary" href="/">返回登录</a></div> : <form onSubmit={submit}><label><span>新密码</span><input type="password" minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!token} /></label>{message ? <div className="auth-message">{message}</div> : null}<button className="button primary auth-submit" disabled={pending || !token}>{pending ? <LoaderCircle className="spin" size={16} /> : null}更新密码</button></form>}
      </section>
    </main>
  );
}
