import fs from 'fs/promises';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db, sqliteConnection } from './db.js';
import { indexedFiles } from './schema.js';
import { loadConfig } from './config.js';
import { runMigrations } from './migrate.js';
import { extractText } from './services/ocr.js';
import { processTextAndEmbed } from './services/embed.js';
import { startWatcher } from './services/watcher.js';
import { uploadRawFile, deleteRawFile, uploadDatabaseIndex } from './services/sync.js';

const config = loadConfig();

// Debounce state for uploading the SQLite index to Cloud Storage
let syncDebounceTimeout: NodeJS.Timeout | null = null;

/**
 * Debounces database index synchronization.
 * If 100 files are added in rapid succession, we only upload the .sqlite database
 * once (5 seconds after the last file has finished processing).
 */
function queueDatabaseSync() {
  if (syncDebounceTimeout) {
    clearTimeout(syncDebounceTimeout);
  }
  syncDebounceTimeout = setTimeout(async () => {
    try {
      await uploadDatabaseIndex();
    } catch (error) {
      console.error('[Sync Queue Error] Debounced upload failed:', error);
    }
  }, 5000);
}

/**
 * Handles adding or updating a local document.
 * 1. Reads & extracts text (via PDF parsing, OCR, or direct text reading).
 * 2. Generates token-safe 384-dim semantic vectors.
 * 3. Uploads the raw file to Supabase Cloud Storage (getting a signed URL).
 * 4. Inserts or updates the local SQLite database record.
 * 5. Triggers a debounced upload of the index file.
 */
async function handleAddOrChange(filePath: string) {
  try {
    const fileName = path.basename(filePath);
    const stats = await fs.stat(filePath);
    
    // Skip folders
    if (stats.isDirectory()) return;

    console.log(`[Daemon] Processing file: ${fileName} (${(stats.size / 1024).toFixed(1)} KB)`);

    // 1. Text & Category extraction
    const { text, category } = await extractText(filePath);

    // 2. Token-safe embedding generation
    const { textContent, vector } = await processTextAndEmbed(text);

    // Check if the file was already indexed previously (to overwrite/update)
    const existingFile = db.select().from(indexedFiles).where(eq(indexedFiles.localPath, filePath)).get();
    
    let cloudUrl = '';
    let cloudPath = '';

    if (existingFile) {
      console.log(`[Daemon] File already exists in index. Re-uploading...`);
      // Clean up the old cloud file to save space
      await deleteRawFile(existingFile.cloudPath);
    }

    // 3. Upload raw file to cloud storage
    const uploadResult = await uploadRawFile(filePath);
    cloudUrl = uploadResult.cloudUrl;
    cloudPath = uploadResult.cloudPath;

    // 4. Update SQLite database
    const now = Date.now();
    const vectorBuffer = Buffer.from(vector.buffer);

    if (existingFile) {
      db.update(indexedFiles)
        .set({
          fileName,
          fileSize: stats.size,
          category,
          textContent,
          cloudUrl,
          cloudPath,
          vector: vectorBuffer,
          updatedAt: now
        })
        .where(eq(indexedFiles.localPath, filePath))
        .run();
      console.log(`[Daemon] Updated index entry for ${fileName}`);
    } else {
      db.insert(indexedFiles)
        .values({
          localPath: filePath,
          fileName,
          fileSize: stats.size,
          category,
          textContent,
          cloudUrl,
          cloudPath,
          vector: vectorBuffer,
          createdAt: now,
          updatedAt: now
        })
        .run();
      console.log(`[Daemon] Created index entry for ${fileName}`);
    }

    // 5. Sync the updated index db to cloud
    queueDatabaseSync();
  } catch (error) {
    console.error(`[Daemon Error] Failed to handle add/change for ${filePath}:`, error);
  }
}

/**
 * Handles deleting a document.
 * 1. Checks if file is present in SQLite.
 * 2. Deletes raw file from cloud storage.
 * 3. Deletes database entry.
 * 4. Triggers debounced sync of index file.
 */
async function handleRemove(filePath: string) {
  try {
    const fileName = path.basename(filePath);
    const existingFile = db.select().from(indexedFiles).where(eq(indexedFiles.localPath, filePath)).get();
    
    if (!existingFile) {
      console.log(`[Daemon] File ${fileName} was not indexed. Skipping removal sync.`);
      return;
    }

    // 1. Remove from cloud storage
    await deleteRawFile(existingFile.cloudPath);

    // 2. Remove from database
    db.delete(indexedFiles).where(eq(indexedFiles.localPath, filePath)).run();
    console.log(`[Daemon] Removed index entry for ${fileName}`);

    // 3. Sync database change to cloud
    queueDatabaseSync();
  } catch (error) {
    console.error(`[Daemon Error] Failed to handle removal for ${filePath}:`, error);
  }
}

/**
 * Entrypoint to start the local backend daemon
 */
async function main() {
  console.log('====================================');
  console.log('      OMNISearch Desktop Daemon      ');
  console.log('====================================');

  // Ensure database is migrated to latest schema
  await runMigrations();

  // Create watch folder if it doesn't exist
  await fs.mkdir(config.watchDir, { recursive: true });

  // Start watching local folders
  const watcher = startWatcher(config.watchDir, {
    onAddOrChange: handleAddOrChange,
    onRemove: handleRemove
  });

  // Handle clean exit
  process.on('SIGINT', () => {
    console.log('\n[Daemon] Shutting down cleanly...');
    watcher.close();
    sqliteConnection.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Daemon Fatal] Ingestion daemon crashed:', err);
  process.exit(1);
});
