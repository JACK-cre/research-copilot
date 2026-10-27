import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('AI_KEY_ENCRYPTION_SECRET 必须配置为至少 32 个字符的随机密钥。');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(value: string): string {
  const [version, encodedIv, encodedTag, encodedBody] = value.split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedBody) {
    throw new Error('个人 API Key 的加密数据无效。');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedBody, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('个人 API Key 无法解密，请检查 AI_KEY_ENCRYPTION_SECRET 是否被更换。');
  }
}
