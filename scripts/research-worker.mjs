import { startResearchWorker } from '../worker-dist/research-worker.mjs';

void startResearchWorker().catch((error) => {
  console.error('Research worker failed to start.', error);
  process.exit(1);
});
