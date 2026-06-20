import initSqlJs from 'sql.js';

export interface DatabaseResultRow {
  id: number;
  file_name: string;
  local_path: string;
  category: string;
  text_content: string;
  cloud_url: string;
  similarity: number;
}

/**
 * Initializes sql.js using CDN-hosted WASM files and loads the synced database binary in-memory.
 * Registers the custom 'dot_product' SQL function to execute edge-based vector searches.
 */
export async function loadSqlDatabase(dbArrayBuffer: ArrayBuffer) {
  // Load the SQL.js WASM engine locally from the public directory
  const SQL = await initSqlJs({
    locateFile: (file) => `/${file}`
  });

  // Create an in-memory database representation from the downloaded index binary
  const db = new SQL.Database(new Uint8Array(dbArrayBuffer));

  // Register the custom dot-product calculation for matching normalized floats
  db.create_function('dot_product', (a: unknown, b: unknown) => {
    // When SQLite passes BLOB data to a custom JS function, it arrives as a Uint8Array
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
      return 0;
    }

    // Wrap Float32Array views over the underlying ArrayBuffers
    const arrA = new Float32Array(a.buffer, a.byteOffset, a.length / 4);
    const arrB = new Float32Array(b.buffer, b.byteOffset, b.length / 4);

    let dot = 0;
    const len = arrA.length;
    for (let i = 0; i < len; i++) {
      dot += arrA[i] * arrB[i];
    }
    return dot;
  });

  return db;
}

/**
 * Executes a semantic vector search against the loaded in-memory database.
 */
export function querySimilarity(db: any, queryVector: number[], limit = 5): DatabaseResultRow[] {
  // Convert query float array into binary Uint8Array representation
  const queryFloat32 = new Float32Array(queryVector);
  const queryBlob = new Uint8Array(queryFloat32.buffer, queryFloat32.byteOffset, queryFloat32.byteLength);

  // Prepare SQL statement
  const stmt = db.prepare(`
    SELECT 
      id,
      file_name,
      local_path,
      category,
      text_content,
      cloud_url,
      dot_product(vector, :queryVector) AS similarity
    FROM indexed_files
    ORDER BY similarity DESC
    LIMIT :limit
  `);

  stmt.bind({
    ':queryVector': queryBlob,
    ':limit': limit
  });

  const results: DatabaseResultRow[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      id: row.id as number,
      file_name: row.file_name as string,
      local_path: row.local_path as string,
      category: row.category as string,
      text_content: row.text_content as string,
      cloud_url: row.cloud_url as string,
      similarity: row.similarity as number
    });
  }

  stmt.free();
  return results;
}
