import { db, sqliteConnection } from './db.js';
import { indexedFiles } from './schema.js';
import { processTextAndEmbed } from './services/embed.js';
import path from 'path';

/**
 * standalone CLI search tool for PC.
 * Runs vector embeddings search directly on the local SQLite DB.
 */
async function searchCLI() {
  const query = process.argv.slice(2).join(' ');
  
  if (!query) {
    console.error('Error: Please provide a search query.');
    console.error('Usage: npm run search -- "your search query here"');
    process.exit(1);
  }

  console.log(`\nEmbedding search query: "${query}"...`);
  
  try {
    // 1. Generate search vector (uses safe embedding processing)
    const { vector } = await processTextAndEmbed(query);
    const vectorBuffer = Buffer.from(vector.buffer);

    console.log('Searching local SQLite index...');

    // 2. Perform Cosine Similarity using custom SQL registered dot_product function
    // Dot product on L2-normalized vectors is exactly equivalent to Cosine Similarity.
    // Drizzle does not support custom functions in type-safe DSL easily, so we run a raw SQL query.
    const results = sqliteConnection.prepare(`
      SELECT 
        id,
        file_name,
        local_path,
        category,
        text_content,
        dot_product(vector, ?) AS similarity
      FROM indexed_files
      ORDER BY similarity DESC
      LIMIT 5
    `).all(vectorBuffer) as Array<{
      id: number;
      file_name: string;
      local_path: string;
      category: string;
      text_content: string;
      similarity: number;
    }>;

    console.log('\n======================================================');
    console.log(`                   Search Results                    `);
    console.log('======================================================');

    if (results.length === 0) {
      console.log('No files found in index. Please drop files into your watched directory first.');
      return;
    }

    results.forEach((row, idx) => {
      const matchPercent = (row.similarity * 100).toFixed(1);
      console.log(`\n${idx + 1}. [Match: ${matchPercent}%] - ${row.file_name} (${row.category.toUpperCase()})`);
      console.log(`   Path: ${row.local_path}`);
      console.log(`   Snippet: "${row.text_content ? row.text_content.replace(/\n/g, ' ').substring(0, 150) + '...' : '(No text content)'}"`);
    });
    console.log('======================================================\n');

  } catch (error) {
    console.error('Search failed:', error);
  } finally {
    // Close SQLite connection and exit cleanly
    sqliteConnection.close();
  }
}

searchCLI();
