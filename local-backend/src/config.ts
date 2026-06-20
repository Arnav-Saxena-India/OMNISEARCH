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
  isOffline: boolean;
}

export function loadConfig(): Config {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_BUCKET,
    WATCH_DIR,
    DATABASE_URL,
    OFFLINE,
  } = process.env;

  // Auto-detect offline mode if OFFLINE=true or credentials are placeholder/missing
  const isOffline = OFFLINE === 'true' || 
                    !SUPABASE_URL || 
                    SUPABASE_URL.includes('replace-with-your-project') ||
                    !SUPABASE_SERVICE_ROLE_KEY || 
                    SUPABASE_SERVICE_ROLE_KEY.includes('replace-with-your-service-role-key');

  return {
    supabaseUrl: SUPABASE_URL || '',
    supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseBucket: SUPABASE_BUCKET || 'omnisearch-files',
    watchDir: path.resolve(WATCH_DIR || './docs'),
    databaseUrl: DATABASE_URL || 'omnisearch.db',
    isOffline,
  };
}
