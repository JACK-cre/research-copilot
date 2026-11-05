import JSZip from 'jszip';

const MAX_REFERENCE_CHARACTERS = 80_000;

export function cleanExtractedText(value: string, maxCharacters = MAX_REFERENCE_CHARACTERS): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxCharacters);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function extractXmlTexts(xml: string): string[] {
  return [...xml.matchAll(/<a:t\b[^>]*>([^<]*)<\/a:t>/g)]
    .map((match) => decodeXmlEntities(match[1] ?? '').trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export async function extractPptxReference(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/slide(\d+)/i)?.[1] ?? 0);
      const rightNumber = Number(right.match(/slide(\d+)/i)?.[1] ?? 0);
      return leftNumber - rightNumber;
    });

  const slides: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string');
    const texts = extractXmlTexts(xml);
    const index = name.match(/slide(\d+)/i)?.[1] ?? String(slides.length + 1);
    slides.push(texts.length ? `幻灯片 ${index}：${texts.join(' / ')}` : `幻灯片 ${index}：无文字`);
  }

  const themeFile = zip.file('ppt/theme/theme1.xml');
  let themeInfo = '';
  if (themeFile) {
    const xml = await themeFile.async('string');
    const colors = unique([...xml.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)].map((match) => `#${match[1]}`)).slice(0, 8);
    const fonts = unique([...xml.matchAll(/typeface="([^"]+)"/g)].map((match) => match[1])).slice(0, 8);
    themeInfo = [
      colors.length ? `主题色：${colors.join('、')}` : '',
      fonts.length ? `字体：${fonts.join('、')}` : '',
    ].filter(Boolean).join('\n');
  }

  const cleaned = cleanExtractedText([themeInfo, slides.join('\n')].filter(Boolean).join('\n'));
  if (cleaned.length < 20) {
    throw new Error('没有从 PPTX 中提取到足够的版式信息。');
  }
  return cleaned;
}
