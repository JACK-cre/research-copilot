export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startIngestionWorker } = await import('@/lib/ingestion-worker');
  const { startResearchWorker } = await import('@/lib/research-worker');
  void startIngestionWorker().catch((error) => {
    console.error('Could not start the document ingestion worker.', error);
  });
  void startResearchWorker().catch((error) => {
    console.error('Could not start the research worker.', error);
  });
}
