import {
  inferStudyImageMime,
  MAX_STUDY_IMAGE_BYTES,
  STUDY_IMAGE_MAX_EDGE,
} from '@/lib/study-images';

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

export async function normalizeStudyImage(file: File): Promise<{
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}> {
  const mimeType = inferStudyImageMime(file);
  if (!mimeType) throw new Error(`不支持的图片格式：${file.name}`);
  if (file.size > MAX_STUDY_IMAGE_BYTES) {
    throw new Error(`图片 ${file.name} 超过 8MB，请压缩后再发送。`);
  }

  const original = new Uint8Array(await file.arrayBuffer());
  if (mimeType === 'image/gif') {
    return { name: file.name, mimeType, bytes: original };
  }

  try {
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const image = await loadImage(Buffer.from(original));
    const longest = Math.max(image.width, image.height);
    if (longest <= STUDY_IMAGE_MAX_EDGE && original.byteLength <= 1_500_000) {
      return { name: file.name, mimeType, bytes: original };
    }

    const scale = Math.min(1, STUDY_IMAGE_MAX_EDGE / longest);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    const outputMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const encoded = outputMime === 'image/png'
      ? canvas.toBuffer('image/png')
      : canvas.toBuffer('image/jpeg', 82);
    const name = file.name.replace(/\.[^.]+$/, outputMime === 'image/png' ? '.png' : '.jpg');
    return { name, mimeType: outputMime, bytes: new Uint8Array(encoded) };
  } catch {
    return { name: file.name, mimeType, bytes: original };
  }
}
