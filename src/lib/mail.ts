import 'server-only';

import nodemailer from 'nodemailer';

let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

function mailTransport() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) throw new Error('SMTP 邮件服务尚未配置。');
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: user && pass ? { user, pass } : undefined,
  });
  return transporter;
}

function publicBaseUrl(requestOrigin: string): string {
  const url = new URL(process.env.PUBLIC_APP_URL?.trim() || requestOrigin);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('生产环境的 PUBLIC_APP_URL 必须使用 HTTPS。');
  }
  return url.origin;
}

export async function sendPasswordResetEmail(input: {
  email: string;
  token: string;
  requestOrigin: string;
}): Promise<void> {
  const from = process.env.SMTP_FROM?.trim();
  if (!from) throw new Error('SMTP_FROM 尚未配置。');
  const resetUrl = new URL('/reset-password', publicBaseUrl(input.requestOrigin));
  resetUrl.searchParams.set('token', input.token);
  await mailTransport().sendMail({
    from,
    to: input.email,
    subject: '重置 Research Copilot 密码',
    text: `请在 30 分钟内打开以下链接设置新密码：\n\n${resetUrl.toString()}\n\n如果不是你发起的请求，可以忽略这封邮件。`,
    html: `<p>请在 30 分钟内打开下面的链接设置新密码：</p><p><a href="${resetUrl.toString()}">设置新密码</a></p><p>如果不是你发起的请求，可以忽略这封邮件。</p>`,
  });
}
