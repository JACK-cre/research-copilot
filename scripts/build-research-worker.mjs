import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('worker-dist', { recursive: true });
await build({
  entryPoints: ['src/lib/research-worker-standalone.ts'],
  outfile: 'worker-dist/research-worker.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  packages: 'external',
  external: ['@napi-rs/canvas', 'pngjs', 'sharp'],
  alias: {
    '@': './src',
    'server-only': './scripts/worker-shims/server-only.mjs',
  },
  logLevel: 'info',
});
