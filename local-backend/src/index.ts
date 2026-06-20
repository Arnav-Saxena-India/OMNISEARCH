import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from './config.js';
import { extractText } from './services/ocr.js';
import { processTextAndEmbed } from './services/embed.js';
import { startWatcher } from './services/watcher.js';
import { uploadRawFile, deleteRawFile, supabase } from './services/sync.js';
import { initServer } from './server.js';
import type { FSWatcher } from 'chokidar';

const config = loadConfig();

// ── Active watcher reference (replaced on directory change) ─────
let activeWatcher: FSWatcher | null = null;

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
    const encodedName = encodeURIComponent(fileName);
    const localUrl = `http://localhost:4000/files/${encodedName}`;

    // 4. Attempt cloud upload (no-op if offline mode is active)
    const uploadResult = await uploadRawFile(filePath);
    // Prefer cloud URL if available, otherwise fall back to the local Express URL
    const cloudUrl = uploadResult.cloudUrl.startsWith('file://') ? localUrl : uploadResult.cloudUrl;

    // 5. Write to Supabase Postgres directly
    const vectorArray = Array.from(vector);
    
    const { error: dbError } = await supabase
      .from('indexed_files')
      .upsert({
        local_path: filePath,
        content: textContent,
        cloud_url: cloudUrl,
        embedding: vectorArray
      }, {
        onConflict: 'local_path'
      });

    if (dbError) {
      console.error(`[Daemon Error] Supabase Postgres upsert failed for ${fileName}:`, dbError);
    } else {
      console.log(`[Daemon] Synced index entry to Supabase Postgres for ${fileName}`);
    }

  } catch (error) {
    console.error(`[Daemon Error] Failed to handle add/change for ${filePath}:`, error);
  }
}

async function handleRemove(filePath: string) {
  try {
    const fileName = path.basename(filePath);
    
    // Delete from Supabase
    const { error } = await supabase
      .from('indexed_files')
      .delete()
      .eq('local_path', filePath);

    if (error) {
      console.error(`[Daemon Error] Failed to remove ${fileName} from Supabase Postgres:`, error);
    } else {
      console.log(`[Daemon] Removed index entry for ${fileName} from Supabase Postgres`);
    }

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

  // Start the initial watcher
  await spawnWatcher(config.watchDir);

  // Initialize the Express API server; pass the watcher-restart callback
  initServer(config.watchDir, async (newDir: string) => {
    await spawnWatcher(newDir);
  });

  process.on('SIGINT', () => {
    console.log('\n[Daemon] Shutting down cleanly...');
    if (activeWatcher) activeWatcher.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Daemon Fatal] Ingestion daemon crashed:', err);
  process.exit(1);
});
