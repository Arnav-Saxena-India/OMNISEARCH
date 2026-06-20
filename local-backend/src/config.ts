import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

export interface Config {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseBucket: string;
  watchDir: string;
  databaseUrl: string;
}

export function loadConfig(): Config {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_BUCKET,
    WATCH_DIR,
    DATABASE_URL,
  } = process.env;

  if (!SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL environment variable.');
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
  }

  return {
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: SUPABASE_BUCKET || 'omnisearch-files',
    watchDir: path.resolve(WATCH_DIR || './docs'),
    databaseUrl: DATABASE_URL || 'omnisearch.db',
  };
}
