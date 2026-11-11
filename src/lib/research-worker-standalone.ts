import { startResearchWorker } from '@/lib/research-worker';

export { startResearchWorker };

void startResearchWorker().catch((error) => {
  console.error('Could not start the research worker.', error);
  process.exit(1);
});
