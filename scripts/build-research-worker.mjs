import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('worker-dist', { recursive: true });
await build({
  entryPoints: ['src/lib/research-worker-standalone.ts'],
  outfile: 'worker-dist/research-worker.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'bundle',
  external: ['@napi-rs/canvas', 'pngjs'],
  alias: {
    '@': './src',
    'server-only': './scripts/worker-shims/server-only.mjs',
  },
  logLevel: 'info',
});
