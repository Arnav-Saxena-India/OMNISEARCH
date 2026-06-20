import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { loadConfig } from './config.js';
import { sqliteConnection } from './db.js';

const PORT = 4000;
const app = express();
const config = loadConfig();

// ── Middleware ──────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// ── State ───────────────────────────────────────────────────────
// Holds the active watch directory and the function to swap the watcher.
// Both are populated when index.ts calls initServer().
let currentWatchDir: string = config.watchDir;
let restartWatcherCallback: ((newDir: string) => void) | null = null;

/**
 * Called by index.ts on startup to register the watcher-restart callback
 * and set the initially active watch directory.
 */
export function initServer(initialDir: string, onRestartWatcher: (newDir: string) => void) {
  currentWatchDir = initialDir;
  restartWatcherCallback = onRestartWatcher;

  // Serve files dynamically from the *current* watch directory
  app.use('/files', (req, res, next) => {
    express.static(currentWatchDir)(req, res, next);
  });

  app.listen(PORT, () => {
    console.log(`[API Server] Listening on http://localhost:${PORT}`);
    console.log(`[API Server] Serving files from: ${currentWatchDir}`);
  });
}

// ── GET /api/status ─────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  try {
    const row = sqliteConnection
      .prepare('SELECT COUNT(*) as count FROM indexed_files')
      .get() as { count: number };

    const dbPath = path.resolve(config.databaseUrl);
    let dbSize = 0;
    if (fs.existsSync(dbPath)) {
      dbSize = fs.statSync(dbPath).size;
    }

    res.json({
      status: 'running',
      watchDir: currentWatchDir,
      fileCount: row.count,
      dbSize,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// ── POST /api/config ────────────────────────────────────────────
app.post('/api/config', (req, res) => {
  const { watchDir } = req.body as { watchDir?: string };

  if (!watchDir || typeof watchDir !== 'string') {
    return res.status(400).json({ error: 'watchDir is required and must be a string.' });
  }

  const resolvedDir = path.resolve(watchDir);

  if (!fs.existsSync(resolvedDir)) {
    return res.status(400).json({ error: `Directory does not exist: ${resolvedDir}` });
  }

  if (!restartWatcherCallback) {
    return res.status(503).json({ error: 'Watcher not yet initialized. Try again in a moment.' });
  }

  console.log(`[API Server] Config update received. Switching watch dir to: ${resolvedDir}`);
  currentWatchDir = resolvedDir;
  restartWatcherCallback(resolvedDir);

  return res.json({ success: true, watchDir: resolvedDir });
});
