import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { parseOffice } from 'officeparser';

// ── Blocklist: Extensions that must NEVER be indexed ────────────
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.dmg', '.iso', '.zip', '.tar', '.gz', '.bin',
  '.msi', '.sys', '.bat', '.sh', '.com', '.cmd', '.scr',
  '.7z', '.rar', '.bz2', '.xz', '.lnk', '.tmp',
]);

// ── Image extensions handled by Tesseract OCR ───────────────────
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.tif']);

// ── Plain-text extensions read directly as UTF-8 ────────────────
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.log', '.json', '.csv', '.js', '.ts', '.jsx', '.tsx',
  '.html', '.css', '.xml', '.yaml', '.yml', '.ini', '.cfg', '.env',
  '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.rs', '.go', '.rb',
  '.sql', '.sh', '.bat', '.ps1', '.r', '.m', '.swift', '.kt',
]);

// ── Office/document extensions handled by officeparser ──────────
const OFFICE_EXTENSIONS = new Set([
  '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods', '.odg',
]);

/**
 * Extracts textual content from a file based on its extension.
 *
 * Processing pipeline:
 *   1. Blocklist → skip immediately
 *   2. Plain-text → fs.readFile UTF-8
 *   3. PDF → pdf-parse
 *   4. Image → Tesseract.js OCR
 *   5. Office document → officeparser
 *   6. Fallback → metadata-only description
 *
 * Every branch is wrapped in try/catch so the daemon never crashes
 * on corrupted, password-protected, or unexpected files.
 */
export async function extractText(filePath: string): Promise<{ text: string; category: string }> {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // ── 1. Blocklist check ────────────────────────────────────────
  if (BLOCKED_EXTENSIONS.has(ext)) {
    console.log(`[Extractor] Skipped blocked extension: ${fileName} (${ext})`);
    return { text: '', category: 'blocked' };
  }

  let text = '';
  let category = 'miscellaneous';

  try {
    // ── 2. Plain-text files ───────────────────────────────────────
    if (TEXT_EXTENSIONS.has(ext)) {
      text = await fs.readFile(filePath, 'utf-8');
      category = 'text';

    // ── 3. PDF documents ──────────────────────────────────────────
    } else if (ext === '.pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const parsedData = await pdf(dataBuffer);
      text = parsedData.text;
      category = 'document';

    // ── 4. Image OCR ──────────────────────────────────────────────
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      console.log(`[Extractor] Running OCR on image: ${fileName}...`);
      const worker = await createWorker('eng');
      const result = await worker.recognize(filePath);
      text = result.data.text;
      await worker.terminate();
      category = 'image';

    // ── 5. Office documents (DOCX, PPTX, XLSX, ODT, etc.) ───────
    } else if (OFFICE_EXTENSIONS.has(ext)) {
      console.log(`[Extractor] Parsing office document: ${fileName}...`);
      const result = await parseOffice(filePath);
      text = String(result);
      category = 'document';

    // ── 6. Fallback: unknown but not blocked ─────────────────────
    } else {
      const stats = await fs.stat(filePath);
      const parentDir = path.basename(path.dirname(filePath));
      text = `File Name: ${fileName}, Extension: ${ext}, Location: ${parentDir}, Size: ${(stats.size / 1024).toFixed(1)} KB. Unsupported format — metadata only.`;
      category = 'miscellaneous';
    }
  } catch (error: any) {
    console.warn(`[Extractor Warning] Failed to process ${fileName}: ${error.message}`);
    // Safe fallback — return empty text so this file is indexed by name/path only
    text = '';
    category = 'miscellaneous';
  }

  return {
    text: text.trim(),
    category,
  };
}
