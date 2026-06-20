import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import { createWorker } from 'tesseract.js';

/**
 * Service to extract textual content from files depending on their extension.
 * Supports PDFs (via pdf-parse), images (via tesseract.js OCR), text files, 
 * and fallback metadata description for miscellaneous files.
 */
export async function extractText(filePath: string): Promise<{ text: string; category: string }> {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';
  let category = 'miscellaneous';

  try {
    if (['.txt', '.md', '.log', '.json', '.csv', '.js', '.ts', '.html', '.css'].includes(ext)) {
      // Direct text files
      text = await fs.readFile(filePath, 'utf-8');
      category = 'text';
    } else if (ext === '.pdf') {
      // PDF document text parsing
      const dataBuffer = await fs.readFile(filePath);
      const parsedData = await pdf(dataBuffer);
      text = parsedData.text;
      category = 'document';
    } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      // OCR text recognition for images
      console.log(`Running OCR on image: ${path.basename(filePath)}...`);
      const worker = await createWorker('eng');
      const result = await worker.recognize(filePath);
      text = result.data.text;
      await worker.terminate();
      category = 'image';
    } else {
      // Fallback description for any other files (e.g. .docx, .zip, .mp3)
      const fileName = path.basename(filePath);
      const stats = await fs.stat(filePath);
      const parentDir = path.basename(path.dirname(filePath));
      
      text = `File Name: ${fileName}, Extension: ${ext}, Location: ${parentDir}, Size: ${(stats.size / 1024).toFixed(1)} KB. Miscellaneous binary file.`;
      category = 'miscellaneous';
    }
  } catch (error) {
    console.error(`[Extractor Error] Failed to process ${path.basename(filePath)}:`, error);
    // Safe fallback so ingestion daemon does not crash
    const fileName = path.basename(filePath);
    text = `File Name: ${fileName}, Extension: ${ext}. (Error reading content)`;
    category = 'miscellaneous';
  }

  return {
    text: text.trim(),
    category
  };
}
