import chokidar from 'chokidar';
import path from 'path';

// List of file extensions to ignore on the edge to save bandwidth and index size
const EXCLUDED_EXTENSIONS = ['.exe', '.dll', '.sys', '.tmp', '.bat', '.sh', '.msi', '.ds_store', '.lnk'];

interface WatcherCallbacks {
  onAddOrChange: (filePath: string) => Promise<void>;
  onRemove: (filePath: string) => Promise<void>;
}

/**
 * Initializes and starts the directory watcher using chokidar.
 * Automatically handles startup ingestion of existing files and tracks changes.
 */
export function startWatcher(watchDir: string, callbacks: WatcherCallbacks) {
  console.log(`[Watcher] Monitoring directory: ${watchDir}`);

  const watcher = chokidar.watch(watchDir, {
    ignored: (fileOrDirPath) => {
      if (!fileOrDirPath) return false;
      const ext = path.extname(fileOrDirPath).toLowerCase();
      const base = path.basename(fileOrDirPath).toLowerCase();
      // Ignore hidden files and system exclusions
      return EXCLUDED_EXTENSIONS.includes(ext) || base.startsWith('.') || base === 'thumbs.db';
    },
    persistent: true,
    ignoreInitial: false, // Scans existing files on initial startup to backfill index
    awaitWriteFinish: {
      stabilityThreshold: 1500, // Wait 1.5 seconds after final write to start OCR (avoids reading half-copied files)
      pollInterval: 100
    }
  });

  watcher
    .on('add', async (filePath) => {
      const absolutePath = path.resolve(filePath);
      console.log(`[Watcher] New file detected: ${path.basename(absolutePath)}`);
      await callbacks.onAddOrChange(absolutePath);
    })
    .on('change', async (filePath) => {
      const absolutePath = path.resolve(filePath);
      console.log(`[Watcher] File modification detected: ${path.basename(absolutePath)}`);
      await callbacks.onAddOrChange(absolutePath);
    })
    .on('unlink', async (filePath) => {
      const absolutePath = path.resolve(filePath);
      console.log(`[Watcher] File removal detected: ${path.basename(absolutePath)}`);
      await callbacks.onRemove(absolutePath);
    })
    .on('error', (error) => {
      console.error('[Watcher Error] System watcher encountered an error:', error);
    });

  return watcher;
}
