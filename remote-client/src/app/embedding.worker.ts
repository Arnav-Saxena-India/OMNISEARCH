import { pipeline, env } from '@xenova/transformers';

// Disable loading local models since this runs client-side in the browser
env.allowLocalModels = false;

let extractorInstance: any = null;

async function getExtractor(): Promise<any> {
  if (!extractorInstance) {
    self.postMessage({ type: 'status', status: 'loading', message: 'Downloading embedding model (~20MB)...' });
    extractorInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorInstance;
}

// Listen for messages from the Next.js main UI thread
self.addEventListener('message', async (event: MessageEvent) => {
  const { type, text } = event.data;

  if (type === 'load') {
    try {
      await getExtractor();
      self.postMessage({ type: 'status', status: 'ready' });
    } catch (error: any) {
      console.error('[Worker Error] Failed to load model:', error);
      self.postMessage({ type: 'status', status: 'error', error: error.message });
    }
  }

  if (type === 'embed') {
    try {
      const extractor = await getExtractor();
      
      // Perform feature-extraction and run mean pooling + L2 normalization
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true
      });
      
      // Convert standard float32 tensor data into a plain array
      const vector = Array.from(output.data);
      self.postMessage({ type: 'result', vector });
    } catch (error: any) {
      console.error('[Worker Error] Failed to generate embedding:', error);
      self.postMessage({ type: 'result', error: error.message });
    }
  }
});
