'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Settings, 
  Database,
  Cpu, 
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SearchResultCard } from '../components/SearchResultCard';

interface SupabaseResultRow {
  id: number;
  local_path: string;
  content: string;
  cloud_url: string;
  similarity: number;
}

export default function Home() {
  const [workerStatus, setWorkerStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [workerMessage, setWorkerMessage] = useState('AI Model not loaded.');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SupabaseResultRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const workerRef = useRef<Worker | null>(null);

  // 1. Initialize Web Worker for local query embeddings
  useEffect(() => {
    // Instantiate background web worker using Webpack 5 syntax
    const worker = new Worker(new URL('./embedding.worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = async (event) => {
      const { type, status, message, vector, error } = event.data;

      if (type === 'status') {
        setWorkerStatus(status);
        if (message) setWorkerMessage(message);
        if (status === 'ready') setWorkerMessage('AI local model ready (WASM).');
        if (status === 'error') setWorkerMessage(`AI Model Error: ${error}`);
      } else if (type === 'result') {
        if (vector) {
          try {
            // Convert Float32Array to standard array for JSON transport
            const vectorArray = Array.from(vector);
            
            // Query Supabase pgvector RPC
            const { data, error: rpcError } = await supabase.rpc('match_documents', {
              query_embedding: vectorArray,
              match_threshold: 0.2, // Adjust threshold as needed
              match_count: 10
            });

            if (rpcError) throw rpcError;

            setSearchResults(data || []);
          } catch (err: any) {
            setErrorMessage(`Database query failed: ${err.message}`);
          } finally {
            setIsSearching(false);
          }
        } else {
          setErrorMessage(`AI Embedding failed: ${error}`);
          setIsSearching(false);
        }
      }
    };

    worker.postMessage({ type: 'load' });

    return () => {
      worker.terminate();
    };
  }, []);

  // 2. Trigger Search In browser
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (workerStatus !== 'ready') {
      setErrorMessage('AI Model is still downloading. Please wait...');
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

  const getFilenameFromPath = (path: string) => {
    if (!path) return 'Unknown File';
    return path.split(/[/\\]/).pop() || 'Unknown File';
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
      </header>

      <main className="w-full max-w-2xl mx-auto px-4 md:px-0 py-8">
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
        </div>

        {/* Main Search Panel */}
        <form onSubmit={handleSearch} className="mb-10">
          <div className="relative group">
            <input 
              type="text" 
              placeholder="Search documents by meaning... (e.g. 'warranty for the refrigerator')" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-28 py-4 bg-zinc-900 border border-zinc-800 group-hover:border-zinc-700 focus:border-indigo-500 rounded-2xl text-zinc-200 placeholder-zinc-500 focus:outline-none shadow-lg transition-all"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Search className="w-5 h-5 text-zinc-500" />
            </div>
            <button
              type="submit"
              disabled={!searchQuery.trim() || isSearching || workerStatus !== 'ready'}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-xs font-semibold transition"
            >
              {isSearching ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Searching...
                </div>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        {/* Error notification */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-950/20 border border-red-900/50 rounded-xl text-xs text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Search Results list */}
        <div className="space-y-4">
          {searchResults.length > 0 ? (
            searchResults.map((row) => (
              <SearchResultCard
                key={row.id}
                filename={getFilenameFromPath(row.local_path)}
                score={row.similarity}
                uri={row.cloud_url}
                content={row.content || ''}
                searchQuery={searchQuery}
              />
            ))
          ) : (
            !isSearching && (
              <div className="py-12 border border-zinc-850 rounded-2xl bg-zinc-900/10 text-center text-zinc-500">
                <Search className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
                <p className="text-sm">Type a query above to semantic search your files directly via Supabase pgvector.</p>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
