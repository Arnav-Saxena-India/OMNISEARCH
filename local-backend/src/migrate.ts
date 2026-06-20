import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqliteConnection } from './db.js';

export async function runMigrations() {
  console.log("Running database migrations...");
  try {
    // Run the migrations against the database
    migrate(db, { migrationsFolder: './drizzle' });
    console.log("Migrations completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

// Run migrations directly if the script is executed
const isDirectRun = process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js');
if (isDirectRun) {
  runMigrations()
    .then(() => {
      sqliteConnection.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
