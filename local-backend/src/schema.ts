import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';

export const indexedFiles = sqliteTable('indexed_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  localPath: text('local_path').notNull().unique(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  category: text('category').notNull().default('miscellaneous'), // e.g. 'document', 'image', 'text', 'miscellaneous'
  textContent: text('text_content'), // First 500 chars to save space
  cloudUrl: text('cloud_url').notNull(), // Supabase storage URL
  cloudPath: text('cloud_path').notNull(), // Supabase internal storage path (for deletion)
  vector: blob('vector').notNull(), // 384-dim Float32Array stored as binary
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});
