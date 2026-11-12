import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startResearchWorker } = require('../worker-dist/research-worker.cjs');

void startResearchWorker().catch((error) => {
  console.error('Research worker failed to start.', error);
  process.exit(1);
});
