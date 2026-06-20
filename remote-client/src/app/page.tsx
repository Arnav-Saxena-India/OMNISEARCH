'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Search, 
  FileText, 
  Image as ImageIcon, 
  Settings, 
  Cloud, 
  CloudOff, 
  Download, 
  Database,
  Cpu, 
  HelpCircle,
  FileCode,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { loadSqlDatabase, querySimilarity, DatabaseResultRow } from './db-loader';

export default function Home() {
  // App state
  const [db, setDb] = useState<any>(null);
  const [supabaseConfig, setSupabaseConfig] = useState({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://replace-with-your-project.supabase.co',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'replace-with-your-anon-key',
    bucket: process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'omnisearch-files',
  });
  
  const [isOfflineMode, setIsOfflineMode] = useState(true);
  const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [workerStatus, setWorkerStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [workerMessage, setWorkerMessage] = useState('AI Model not loaded.');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DatabaseResultRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [totalFilesCount, setTotalFilesCount] = useState(0);

  // Local daemon state (Express on port 4000)
  const [daemonStatus, setDaemonStatus] = useState<'unknown' | 'running' | 'offline'>('unknown');
  const [daemonWatchDir, setDaemonWatchDir] = useState('');
  const [newWatchDir, setNewWatchDir] = useState('');
  const [watchDirSaving, setWatchDirSaving] = useState(false);
  const [watchDirMessage, setWatchDirMessage] = useState('');

  // Connection Mode (Local Network vs Remote Cloud)
  const [connectionMode, setConnectionMode] = useState<'local' | 'remote'>('local');

  // Load connectionMode on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('omnisearch_connection_mode');
    if (savedMode === 'local' || savedMode === 'remote') {
      setConnectionMode(savedMode);
    }
  }, []);

  const handleSetConnectionMode = (mode: 'local' | 'remote') => {
    setConnectionMode(mode);
    localStorage.setItem('omnisearch_connection_mode', mode);
  };

  const workerRef = useRef<Worker | null>(null);

  // Auto-detect if credentials are placeholders
  useEffect(() => {
    const isPlaceholder = 
      supabaseConfig.url.includes('replace-with-your-project') || 
      supabaseConfig.anonKey.includes('replace-with-your-anon-key');
    setIsOfflineMode(isPlaceholder);
  }, [supabaseConfig]);

  // 1. Initialize Web Worker for local query embeddings
  useEffect(() => {
    // Instantiate background web worker using Webpack 5 syntax
    const worker = new Worker(new URL('./embedding.worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type, status, message, vector, error } = event.data;

      if (type === 'status') {
        setWorkerStatus(status);
        if (message) setWorkerMessage(message);
        if (status === 'ready') setWorkerMessage('AI local model ready (WASM).');
        if (status === 'error') setWorkerMessage(`AI Model Error: ${error}`);
      } else if (type === 'result') {
        setIsSearching(false);
        if (vector) {
          if (db) {
            try {
              const matches = querySimilarity(db, vector, 10);
              setSearchResults(matches);
            } catch (err: any) {
              setErrorMessage(`Database query failed: ${err.message}`);
            }
          } else {
            setErrorMessage('Database index not loaded.');
          }
        } else {
          setErrorMessage(`AI Embedding failed: ${error}`);
        }
      }
    };

    worker.postMessage({ type: 'load' });

    return () => {
      worker.terminate();
    };
  }, [db]);

  // 2. Fetch SQLite index file from Supabase Storage
  const fetchDatabaseFromCloud = async () => {
    setDbStatus('loading');
    setErrorMessage('');
    try {
      const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
      
      console.log(`[PWA] Downloading index file from Supabase: ${supabaseConfig.bucket}`);
      const { data, error } = await supabase.storage
        .from(supabaseConfig.bucket)
        .download('omnisearch_index.sqlite');

      if (error) {
        throw error;
      }

      const arrayBuffer = await data.arrayBuffer();
      const loadedDb = await loadSqlDatabase(arrayBuffer);
      
      // Query file count
      const countRes = loadedDb.exec('SELECT COUNT(*) as count FROM indexed_files');
      if (countRes.length > 0 && countRes[0].values.length > 0) {
        setTotalFilesCount(countRes[0].values[0][0] as number);
      }

      setDb(loadedDb);
      setDbStatus('ready');
    } catch (err: any) {
      console.error(err);
      setDbStatus('error');
      setErrorMessage(`Cloud sync failed: ${err.message}. Try uploading your local database index file manually below.`);
    }
  };

  // 3. Load SQLite index file manually from local drive (.db file)
  const handleLocalDbUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDbStatus('loading');
    setErrorMessage('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadedDb = await loadSqlDatabase(arrayBuffer);

      const countRes = loadedDb.exec('SELECT COUNT(*) as count FROM indexed_files');
      if (countRes.length > 0 && countRes[0].values.length > 0) {
        setTotalFilesCount(countRes[0].values[0][0] as number);
      }

      setDb(loadedDb);
      setDbStatus('ready');
    } catch (err: any) {
      console.error(err);
      setDbStatus('error');
      setErrorMessage(`Failed to load SQLite file: ${err.message}`);
    }
  };

  // Try auto-loading DB from local or cloud based on connectionMode
  const fetchDatabaseFromLocal = async () => {
    setDbStatus('loading');
    setErrorMessage('');
    try {
      console.log('[PWA] Downloading index file from Local Daemon');
      const res = await fetch('http://localhost:4000/api/database');
      if (!res.ok) {
        throw new Error(`Daemon database endpoint returned status ${res.status}`);
      }
      const data = await res.blob();
      const arrayBuffer = await data.arrayBuffer();
      const loadedDb = await loadSqlDatabase(arrayBuffer);

      // Query file count
      const countRes = loadedDb.exec('SELECT COUNT(*) as count FROM indexed_files');
      if (countRes.length > 0 && countRes[0].values.length > 0) {
        setTotalFilesCount(countRes[0].values[0][0] as number);
      }

      setDb(loadedDb);
      setDbStatus('ready');
    } catch (err: any) {
      console.error(err);
      setDbStatus('error');
      setErrorMessage(`Failed to auto-load database from local daemon: ${err.message}. Make sure your desktop daemon is running or upload omnisearch.db manually.`);
    }
  };

  useEffect(() => {
    // Determine the connection mode dynamically
    const mode = localStorage.getItem('omnisearch_connection_mode') || 'local';
    if (mode === 'local') {
      fetchDatabaseFromLocal();
    } else {
      const isPlaceholder = 
        supabaseConfig.url.includes('replace-with-your-project') || 
        supabaseConfig.anonKey.includes('replace-with-your-anon-key');
      if (!isPlaceholder) {
        fetchDatabaseFromCloud();
      }
    }
  }, [connectionMode]);

  // Poll local Express daemon status every 5 seconds
  useEffect(() => {
    const pollDaemon = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/status', { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          setDaemonStatus('running');
          setDaemonWatchDir(data.watchDir || '');
          setNewWatchDir(prev => prev || data.watchDir || '');
          if (data.fileCount !== undefined) setTotalFilesCount(data.fileCount);
        } else {
          setDaemonStatus('offline');
        }
      } catch {
        setDaemonStatus('offline');
      }
    };
    pollDaemon();
    const interval = setInterval(pollDaemon, 5000);
    return () => clearInterval(interval);
  }, []);

  // Save new watchDir to daemon via POST /api/config
  const handleSaveWatchDir = async () => {
    if (!newWatchDir.trim()) return;
    setWatchDirSaving(true);
    setWatchDirMessage('');
    try {
      const res = await fetch('http://localhost:4000/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchDir: newWatchDir.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setDaemonWatchDir(data.watchDir);
        setWatchDirMessage(`✓ Watcher restarted on: ${data.watchDir}`);
      } else {
        setWatchDirMessage(`✗ Error: ${data.error}`);
      }
    } catch (err: any) {
      setWatchDirMessage(`✗ Could not reach daemon: ${err.message}`);
    } finally {
      setWatchDirSaving(false);
    }
  };

  // 4. Trigger Search In browser
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (workerStatus !== 'ready') {
      setErrorMessage('AI Model is still downloading. Please wait...');
      return;
    }
    if (!db) {
      setErrorMessage('Please load a database index file first.');
      return;
    }

    setIsSearching(true);
    setErrorMessage('');
    
    // Post text to the background worker to embed
    workerRef.current?.postMessage({
      type: 'embed',
      text: searchQuery
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'document': return <FileText className="w-5 h-5 text-indigo-400" />;
      case 'image': return <ImageIcon className="w-5 h-5 text-pink-400" />;
      case 'text': return <FileCode className="w-5 h-5 text-emerald-400" />;
      default: return <HelpCircle className="w-5 h-5 text-amber-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 text-zinc-100 font-sans">
      {/* Header bar */}
      <header className="border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">OmniSearch</h1>
            <p className="text-[10px] text-zinc-400 font-mono">Edge-Cloud Hybrid Search</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Sync indicator */}
          <button 
            onClick={() => !isOfflineMode && fetchDatabaseFromCloud()}
            disabled={isOfflineMode || dbStatus === 'loading'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              isOfflineMode 
                ? 'border-amber-900/30 bg-amber-950/20 text-amber-400'
                : dbStatus === 'ready'
                  ? 'border-emerald-800/40 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/50'
                  : 'border-indigo-800/30 bg-indigo-950/20 text-indigo-400 hover:bg-indigo-950/40'
            }`}
          >
            {isOfflineMode ? (
              <>
                <CloudOff className="w-3.5 h-3.5" />
                <span>Offline Mode</span>
              </>
            ) : dbStatus === 'loading' ? (
              <>
                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span>Syncing Index...</span>
              </>
            ) : (
              <>
                <Cloud className="w-3.5 h-3.5" />
                <span>Sync SQLite DB</span>
              </>
            )}
          </button>

          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Settings Drawer / Panel */}
        {showSettings && (
          <div className="mb-8 p-6 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl transition-all space-y-6">

            {/* Connection Mode Selector */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Cloud className="w-5 h-5 text-indigo-500" />
                Connection Mode
              </h3>
              <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 max-w-md">
                <button
                  type="button"
                  onClick={() => handleSetConnectionMode('local')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                    connectionMode === 'local'
                      ? 'bg-indigo-600 text-white shadow-lg'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  Local Network
                </button>
                <button
                  type="button"
                  onClick={() => handleSetConnectionMode('remote')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                    connectionMode === 'remote'
                      ? 'bg-indigo-600 text-white shadow-lg'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  Remote Cloud
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500 leading-normal">
                {connectionMode === 'local'
                  ? '✓ Auto-connecting to desktop edge node on port 4000. Low latency, 100% private.'
                  : '✓ Fetching search index database and downloading files from Supabase secure cloud storage.'}
              </p>
            </div>

            {/* Watched Folder Config (Local Daemon) */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-indigo-500" />
                Desktop Watcher Config
              </h3>
              <div className="flex items-center gap-1.5 mb-3 text-xs">
                <span className={`w-2 h-2 rounded-full ${daemonStatus === 'running' ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                <span className="text-zinc-400">Daemon: <span className="text-zinc-300 font-mono">{daemonStatus}</span></span>
                {daemonWatchDir && <span className="text-zinc-500 ml-2 truncate max-w-xs font-mono">({daemonWatchDir})</span>}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. C:/Users/YourName/Documents"
                  value={newWatchDir}
                  onChange={(e) => setNewWatchDir(e.target.value)}
                  className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleSaveWatchDir}
                  disabled={watchDirSaving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
                >
                  {watchDirSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
              {watchDirMessage && (
                <p className={`mt-2 text-xs font-mono ${watchDirMessage.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {watchDirMessage}
                </p>
              )}
            </div>

            {/* Supabase Settings */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-500" />
                Supabase Credentials
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Supabase URL</label>
                  <input
                    type="text"
                    value={supabaseConfig.url}
                    onChange={(e) => setSupabaseConfig({ ...supabaseConfig, url: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Anon API Key</label>
                  <input
                    type="password"
                    value={supabaseConfig.anonKey}
                    onChange={(e) => setSupabaseConfig({ ...supabaseConfig, anonKey: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowSettings(false);
                    fetchDatabaseFromCloud();
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
                >
                  Save and Connect Cloud
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Database Status Panel */}
        {dbStatus !== 'ready' && (
          <div className="mb-8 p-8 border border-dashed border-zinc-800 bg-zinc-900/40 rounded-2xl text-center flex flex-col items-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
            <h2 className="text-lg font-semibold text-white mb-1">Index Database Not Loaded</h2>
            
            {errorMessage ? (
              <p className="text-xs text-red-400 max-w-lg mb-4">{errorMessage}</p>
            ) : (
              <p className="text-sm text-zinc-400 max-w-md mb-4">
                To start searching, download your database from Supabase Storage or drag and drop your local SQLite index file.
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
              {connectionMode === 'local' ? (
                <button
                  onClick={fetchDatabaseFromLocal}
                  disabled={dbStatus === 'loading'}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-xl text-sm font-medium transition"
                >
                  {dbStatus === 'loading' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Fetch from Local Daemon
                    </>
                  )}
                </button>
              ) : (
                !isOfflineMode && (
                  <button
                    onClick={fetchDatabaseFromCloud}
                    disabled={dbStatus === 'loading'}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-xl text-sm font-medium transition"
                  >
                    {dbStatus === 'loading' ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download from Supabase
                      </>
                    )}
                  </button>
                )
              )}
              
              <label className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded-xl text-sm font-medium cursor-pointer transition">
                <FolderOpen className="w-4 h-4" />
                Select Local omnisearch.db
                <input 
                  type="file" 
                  accept=".db,.sqlite,.sqlite3" 
                  onChange={handleLocalDbUpload} 
                  className="hidden" 
                />
              </label>
            </div>
          </div>
        )}

        {/* Model status indicator banner */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-zinc-900/60 border border-zinc-850 rounded-xl text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <span>Local AI Processor:</span>
            <span className="font-mono text-zinc-300">{workerMessage}</span>
          </div>
          {workerStatus === 'loading' && (
            <div className="w-full sm:w-24 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full rounded-full animate-pulse w-2/3" />
            </div>
          )}
          {dbStatus === 'ready' && (
            <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-medium">
              <Database className="w-3.5 h-3.5" />
              <span>Loaded {totalFilesCount} documents</span>
            </div>
          )}
        </div>

        {/* Main Search Panel */}
        <form onSubmit={handleSearch} className="mb-10">
          <div className="relative group">
            <input 
              type="text" 
              placeholder="Search documents by meaning... (e.g. 'warranty for the refrigerator')" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={dbStatus !== 'ready'}
              className="w-full pl-12 pr-28 py-4 bg-zinc-900 border border-zinc-800 group-hover:border-zinc-700 focus:border-indigo-500 rounded-2xl text-zinc-200 placeholder-zinc-500 focus:outline-none shadow-lg transition-all"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Search className="w-5 h-5 text-zinc-500" />
            </div>
            <button
              type="submit"
              disabled={!searchQuery.trim() || isSearching || dbStatus !== 'ready'}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-xs font-semibold transition"
            >
              {isSearching ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Embedding...
                </div>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        {/* Error notification */}
        {errorMessage && dbStatus === 'ready' && (
          <div className="mb-6 p-4 bg-red-950/20 border border-red-900/50 rounded-xl text-xs text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Search Results list */}
        <div className="space-y-4">
          {searchResults.length > 0 ? (
            searchResults.map((row) => {
              const score = (row.similarity * 100).toFixed(1);
              const scoreNum = parseFloat(score);
              const scoreColor = scoreNum > 70 
                ? 'text-emerald-400 bg-emerald-950/50 border-emerald-800/30' 
                : scoreNum > 40 
                  ? 'text-amber-400 bg-amber-950/50 border-amber-800/30' 
                  : 'text-zinc-400 bg-zinc-950/50 border-zinc-800/30';

              return (
                <div 
                  key={row.id}
                  className="p-5 bg-zinc-900/70 border border-zinc-850 rounded-2xl hover:border-zinc-750 transition hover:shadow-lg flex flex-col md:flex-row justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-zinc-800/60 inline-block">
                        {getCategoryIcon(row.category)}
                      </span>
                      <h4 className="font-semibold text-white text-base tracking-tight">{row.file_name}</h4>
                      <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${scoreColor}`}>
                        {score}% Match
                      </span>
                    </div>

                    <p className="text-zinc-400 text-sm leading-relaxed font-sans pl-1">
                      {row.text_content ? `"...${row.text_content}..."` : '(No text extracted)'}
                    </p>

                    <div className="text-[10px] text-zinc-500 font-mono tracking-tighter pl-1">
                      Local Path: <span className="text-zinc-400">{row.local_path}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                     <a 
                      href={
                        connectionMode === 'local'
                          ? `http://localhost:4000/files/${encodeURIComponent(row.file_name)}`
                          : row.cloud_url
                      }
                      download={row.file_name}
                      className="flex items-center gap-1.5 px-4 py-2 border border-indigo-700/50 hover:border-indigo-500 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 hover:text-white text-xs font-semibold rounded-xl transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </a>
                  </div>
                </div>
              );
            })
          ) : (
            dbStatus === 'ready' && !isSearching && (
              <div className="py-12 border border-zinc-850 rounded-2xl bg-zinc-900/10 text-center text-zinc-500">
                <Search className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
                <p className="text-sm">Type a query above to semantic search your files locally.</p>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
