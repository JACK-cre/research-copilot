'use client';

import { Check, LoaderCircle, LockKeyhole } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function ResetPasswordForm({ url, anonKey }: { url: string; anonKey: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(url, anonKey), [anonKey, url]);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setComplete(true);
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-heading"><LockKeyhole size={20} /><h1>设置新密码</h1><p>新密码至少需要 8 个字符。</p></div>
        {complete ? <div className="reset-complete"><Check size={20} /><strong>密码已更新</strong><a className="button primary" href="/">返回工作台</a></div> : <form onSubmit={submit}><label><span>新密码</span><input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{message ? <div className="auth-message">{message}</div> : null}<button className="button primary auth-submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : null}更新密码</button></form>}
      </section>
    </main>
  );
}
