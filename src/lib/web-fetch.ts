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
  const ipv6 = host.replace(/^\[|\]$/g, '');
  if (ipv6.includes(':')) {
    return ipv6 === '::1'
      || ipv6 === '::'
      || ipv6.startsWith('fc')
      || ipv6.startsWith('fd')
      || ipv6.startsWith('fe8')
      || ipv6.startsWith('fe9')
      || ipv6.startsWith('fea')
      || ipv6.startsWith('feb');
  }
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
  options: { maxChars?: number; maxBytes?: number; maxRedirects?: number } = {},
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
  const maxBytes = Math.min(Math.max(options.maxBytes ?? 2_000_000, 32_000), 5_000_000);
  const maxRedirects = Math.min(Math.max(options.maxRedirects ?? 3, 0), 5);
  let current = parsed;
  let response: Response | undefined;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    response = await fetch(current, {
      headers: { Accept: 'text/html, application/xhtml+xml, application/xml;q=0.9, text/plain;q=0.8', 'User-Agent': 'ResearchCopilot/0.1' },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirects === maxRedirects) throw new Error('网页重定向次数过多或缺少目标地址。');
      const next = new URL(location, current);
      if ((next.protocol !== 'http:' && next.protocol !== 'https:') || isBlockedFetchHost(next.hostname)) {
        throw new Error('拒绝重定向到内网或本机地址。');
      }
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`网页读取失败：HTTP ${response.status}`);
    break;
  }
  if (!response || !response.ok) throw new Error('网页读取失败。');
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new Error('网页响应过大，已停止读取。');
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = '';
  if (reader) {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('网页响应过大，已停止读取。'); }
      html += decoder.decode(part.value, { stream: true });
    }
    html += decoder.decode();
  } else {
    html = await response.text();
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? current.hostname;
  const text = htmlToText(html).slice(0, options.maxChars ?? 8000);
  if (!text) throw new Error('网页没有可提取的正文。');
  return { url: current.toString(), title: htmlToText(title).slice(0, 180), text };
}
