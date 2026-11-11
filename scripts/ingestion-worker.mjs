import { startStandaloneIngestionWorker } from '../worker-dist/ingestion-worker.mjs';

void startStandaloneIngestionWorker().catch((error) => {
  console.error('Ingestion worker failed to start.', error);
  process.exit(1);
});
