import { fetchText } from '@/lib/http';
import { normalizeWhitespace } from '@/lib/text';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
]);

export function isBlockedFetchHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host === '::1' || host === '0.0.0.0') return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return a === 10
      || a === 127
      || a === 0
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }
  return false;
}

export function htmlToText(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

export async function fetchPublicPage(
  rawUrl: string,
  options: { maxChars?: number } = {},
): Promise<{ url: string; title: string; text: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('网页地址无效。');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('只允许读取 http/https 公开网页。');
  }
  if (isBlockedFetchHost(parsed.hostname)) {
    throw new Error('拒绝访问内网或本机地址。');
  }

  const html = await fetchText(parsed, { timeoutMs: 10_000, retries: 1 });
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? parsed.hostname;
  const text = htmlToText(html).slice(0, options.maxChars ?? 8000);
  if (!text) throw new Error('网页没有可提取的正文。');
  return { url: parsed.toString(), title: htmlToText(title).slice(0, 180), text };
}
