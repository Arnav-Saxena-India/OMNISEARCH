import { pipeline } from '@xenova/transformers';

let extractorInstance: any = null;

/**
 * Get or load the pipeline extractor instance.
 * Uses Xenova/all-MiniLM-L6-v2 to produce 384-dimensional normalized vectors.
 */
export async function getExtractor() {
  if (!extractorInstance) {
    console.log("LOADING AI MODEL (Xenova/all-MiniLM-L6-v2)...");
    // Auto-downloads the ONNX model from HF Hub if not cached locally
    extractorInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorInstance;
}

/**
 * Tokenizes, truncates text to safe limits (200 tokens), decodes, 
 * and generates the L2-normalized 384-dimensional vector embedding.
 * Keeps text_content limited to first 500 characters to optimize SQLite database size.
 */
export async function processTextAndEmbed(text: string): Promise<{ textContent: string; vector: Float32Array }> {
  const extractor = await getExtractor();
  const tokenizer = extractor.tokenizer;

  // 1. Encode text to token IDs
  const encoded = tokenizer.encode(text);
  const tokens = Array.isArray(encoded) ? encoded : Array.from(encoded);

  // 2. Truncate to maximum 200 tokens to guarantee no model crashes (model max is 256/512)
  const truncatedTokens = tokens.slice(0, 200);
  const truncatedText = tokenizer.decode(truncatedTokens, { skip_special_tokens: true });

  // 3. Generate the embedding
  const output = await extractor(truncatedText, {
    pooling: 'mean',
    normalize: true // Ensures vector length = 1.0 (Dot Product similarity is equivalent to Cosine similarity)
  });

  // Extract the Float32Array from the output tensor
  const vector = new Float32Array(output.data);

  return {
    // Save up to 500 characters in database to save space
    textContent: truncatedText.slice(0, 500).trim(),
    vector
  };
}

/**
 * Generates embeddings for a batch of strings in parallel, 
 * useful for indexing folders with multiple files.
 */
export async function processBatchEmbeddings(texts: string[], batchSize = 32): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    // Pass the batch array directly to the model pipeline
    const output = await extractor(batch, {
      pooling: 'mean',
      normalize: true
    });

    const data = output.data as Float32Array;
    const dims = output.dims; // [batch_size, 384]
    const embSize = dims[1];

    for (let j = 0; j < batch.length; j++) {
      const start = j * embSize;
      const end = start + embSize;
      results.push(new Float32Array(data.subarray(start, end)));
    }
  }

  return results;
}
