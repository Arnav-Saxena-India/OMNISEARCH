import chokidar from 'chokidar';
import path from 'path';

// ── Binary extensions the watcher should never emit events for ──
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.dmg', '.iso', '.zip', '.tar', '.gz', '.bin',
  '.msi', '.sys', '.bat', '.sh', '.com', '.cmd', '.scr',
  '.7z', '.rar', '.bz2', '.xz', '.lnk', '.tmp',
]);

interface WatcherCallbacks {
  onAddOrChange: (filePath: string) => Promise<void>;
  onRemove: (filePath: string) => Promise<void>;
}

/**
 * Initializes and starts the directory watcher using chokidar.
 * Automatically handles startup ingestion of existing files and tracks changes.
 *
 * Ignore rules (evaluated at the chokidar level — files never even reach the extractor):
 *   - Hidden files/directories (dotfiles like .DS_Store, .git)
 *   - Microsoft Office lock files (~$*)
 *   - Windows system files (Thumbs.db, desktop.ini)
 *   - All blocked binary extensions (.exe, .dll, .zip, etc.)
 */
export function startWatcher(watchDir: string, callbacks: WatcherCallbacks) {
  console.log(`[Watcher] Monitoring directory: ${watchDir}`);

  const watcher = chokidar.watch(watchDir, {
    ignored: (fileOrDirPath: string) => {
      if (!fileOrDirPath) return false;

      const base = path.basename(fileOrDirPath);
      const ext = path.extname(fileOrDirPath).toLowerCase();

      // Hidden files and directories (e.g. .DS_Store, .git)
      if (base.startsWith('.')) return true;

      // Microsoft Office temporary lock files (e.g. ~$Document.docx)
      if (base.startsWith('~$')) return true;

      // Windows system detritus
      if (base.toLowerCase() === 'thumbs.db' || base.toLowerCase() === 'desktop.ini') return true;

      // Blocked binary extensions
      if (BLOCKED_EXTENSIONS.has(ext)) return true;

      return false;
    },
    persistent: true,
    ignoreInitial: false, // Scan existing files on startup to backfill the index
    awaitWriteFinish: {
      stabilityThreshold: 1500, // Wait 1.5s after the last write before processing (avoids half-copied files)
      pollInterval: 100,
    },
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
