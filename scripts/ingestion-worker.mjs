import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startStandaloneIngestionWorker } = require('../worker-dist/ingestion-worker.cjs');

void startStandaloneIngestionWorker().catch((error) => {
  console.error('Ingestion worker failed to start.', error);
  process.exit(1);
});
