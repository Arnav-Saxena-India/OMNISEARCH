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
import { initServer } from './server.js';
import type { FSWatcher } from 'chokidar';

const config = loadConfig();

// ── Active watcher reference (replaced on directory change) ─────
let activeWatcher: FSWatcher | null = null;

// ── Debounce state ───────────────────────────────────────────────
let syncDebounceTimeout: NodeJS.Timeout | null = null;

function queueDatabaseSync() {
  if (syncDebounceTimeout) clearTimeout(syncDebounceTimeout);
  syncDebounceTimeout = setTimeout(async () => {
    try {
      await uploadDatabaseIndex();
    } catch (error) {
      console.error('[Sync Queue Error] Debounced upload failed:', error);
    }
  }, 5000);
}

// ── File Processing ──────────────────────────────────────────────
async function handleAddOrChange(filePath: string) {
  try {
    const fileName = path.basename(filePath);
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) return;

    console.log(`[Daemon] Processing file: ${fileName} (${(stats.size / 1024).toFixed(1)} KB)`);

    // 1. Extract text & category
    const { text, category } = await extractText(filePath);

    if (category === 'blocked') {
      console.log(`[Daemon] Skipping indexing for blocked file: ${fileName}`);
      return;
    }

    // 2. Generate token-safe 384-dim embedding
    const { textContent, vector } = await processTextAndEmbed(text);

    // 3. CRITICAL FIX: Build a localhost:4000 download URL instead of file://
    //    This allows the browser to download the file without the file:// block.
    const encodedName = encodeURIComponent(fileName);
    const localUrl = `http://localhost:4000/files/${encodedName}`;

    const existingFile = db.select().from(indexedFiles).where(eq(indexedFiles.localPath, filePath)).get();

    if (existingFile) {
      await deleteRawFile(existingFile.cloudPath);
    }

    // 4. Attempt cloud upload (no-op if offline mode is active)
    const uploadResult = await uploadRawFile(filePath);
    // Prefer cloud URL if available, otherwise fall back to the local Express URL
    const cloudUrl = uploadResult.cloudUrl.startsWith('file://') ? localUrl : uploadResult.cloudUrl;
    const cloudPath = uploadResult.cloudPath;

    // 5. Write to SQLite
    const now = Date.now();
    const vectorBuffer = Buffer.from(vector.buffer);

    if (existingFile) {
      db.update(indexedFiles)
        .set({ fileName, fileSize: stats.size, category, textContent, cloudUrl, cloudPath, vector: vectorBuffer, updatedAt: now })
        .where(eq(indexedFiles.localPath, filePath))
        .run();
      console.log(`[Daemon] Updated index entry for ${fileName}`);
    } else {
      db.insert(indexedFiles)
        .values({ localPath: filePath, fileName, fileSize: stats.size, category, textContent, cloudUrl, cloudPath, vector: vectorBuffer, createdAt: now, updatedAt: now })
        .run();
      console.log(`[Daemon] Created index entry for ${fileName}`);
    }

    queueDatabaseSync();
  } catch (error) {
    console.error(`[Daemon Error] Failed to handle add/change for ${filePath}:`, error);
  }
}

async function handleRemove(filePath: string) {
  try {
    const fileName = path.basename(filePath);
    const existingFile = db.select().from(indexedFiles).where(eq(indexedFiles.localPath, filePath)).get();

    if (!existingFile) {
      console.log(`[Daemon] File ${fileName} was not indexed. Skipping removal sync.`);
      return;
    }

    await deleteRawFile(existingFile.cloudPath);
    db.delete(indexedFiles).where(eq(indexedFiles.localPath, filePath)).run();
    console.log(`[Daemon] Removed index entry for ${fileName}`);
    queueDatabaseSync();
  } catch (error) {
    console.error(`[Daemon Error] Failed to handle removal for ${filePath}:`, error);
  }
}

// ── Reusable watcher starter ─────────────────────────────────────
async function spawnWatcher(directory: string) {
  if (activeWatcher) {
    console.log(`[Daemon] Closing existing watcher...`);
    await activeWatcher.close();
    activeWatcher = null;
  }

  console.log(`[Daemon] Starting watcher on: ${directory}`);
  await fs.mkdir(directory, { recursive: true });

  activeWatcher = startWatcher(directory, {
    onAddOrChange: handleAddOrChange,
    onRemove: handleRemove
  });
}

// ── Main Entrypoint ──────────────────────────────────────────────
async function main() {
  console.log('====================================');
  console.log('      OMNISearch Desktop Daemon      ');
  console.log('====================================');

  await runMigrations();

  // Start the initial watcher
  await spawnWatcher(config.watchDir);

  // Initialize the Express API server; pass the watcher-restart callback
  initServer(config.watchDir, async (newDir: string) => {
    await spawnWatcher(newDir);
  });

  process.on('SIGINT', () => {
    console.log('\n[Daemon] Shutting down cleanly...');
    if (activeWatcher) activeWatcher.close();
    sqliteConnection.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Daemon Fatal] Ingestion daemon crashed:', err);
  process.exit(1);
});
