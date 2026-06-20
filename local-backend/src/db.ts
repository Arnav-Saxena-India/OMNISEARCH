import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { loadConfig } from './config.js';
import * as schema from './schema.js';

const config = loadConfig();

// Initialize better-sqlite3 database connection
export const sqliteConnection = new Database(config.databaseUrl);

// Register the custom dot_product function in SQLite for local semantic search
sqliteConnection.function('dot_product', (a: unknown, b: unknown) => {
  if (!(a instanceof Buffer) || !(b instanceof Buffer)) {
    return 0;
  }
  
  // Create Float32Array views directly over the Buffer's memory without copying
  const arrA = new Float32Array(a.buffer, a.byteOffset, a.length / 4);
  const arrB = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  
  let dot = 0;
  const len = arrA.length;
  for (let i = 0; i < len; i++) {
    dot += arrA[i] * arrB[i];
  }
  return dot;
});

// Initialize Drizzle ORM
export const db = drizzle(sqliteConnection, { schema });
