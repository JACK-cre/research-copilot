export const MAX_STUDY_IMAGES = 6;
export const MAX_STUDY_IMAGE_BYTES = 8 * 1024 * 1024;
export const STUDY_IMAGE_MAX_EDGE = 1600;

const STUDY_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export function isStudyImageMime(mime: string): boolean {
  return STUDY_IMAGE_MIME_TYPES.has(mime.trim().toLowerCase());
}

export function inferStudyImageMime(file: { type?: string; name: string }): string {
  const type = file.type?.trim().toLowerCase() ?? '';
  if (isStudyImageMime(type)) return type === 'image/jpg' ? 'image/jpeg' : type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return '';
}

export function studyImageCaption(message: string, imageCount: number): string {
  const text = message.trim();
  if (text) return text;
  if (imageCount > 1) return '请看这些图片';
  if (imageCount === 1) return '请看这张图';
  return '';
}

export function assertStudyImageBatch(count: number): void {
  if (count > MAX_STUDY_IMAGES) {
    throw new Error(`一次最多发送 ${MAX_STUDY_IMAGES} 张图片。`);
  }
}

export function studyAttachmentLabel(names: string[]): string {
  const unique = names.map((name) => name.trim()).filter(Boolean);
  if (!unique.length) return '';
  return `用户发送了图片：${unique.join('、')}`;
}
