import { startStandaloneIngestionWorker } from '@/lib/ingestion-worker';

export { startStandaloneIngestionWorker };

void startStandaloneIngestionWorker().catch((error) => {
  console.error('Could not start the document ingestion worker.', error);
  process.exit(1);
});
