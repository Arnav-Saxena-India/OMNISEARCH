const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('==============================================');
console.log('       OmniSearch Desktop App Setup           ');
console.log('==============================================');

const rootDir = __dirname;
const backendDir = path.join(rootDir, 'local-backend');
const clientDir = path.join(rootDir, 'remote-client');

// 1. Ensure watched folder exists
const docsDir = path.join(backendDir, 'docs');
if (!fs.existsSync(docsDir)) {
  console.log(`[Setup] Creating watched documents folder: ${docsDir}`);
  fs.mkdirSync(docsDir, { recursive: true });
} else {
  console.log(`[Setup] Watched folder already exists: ${docsDir}`);
}

// 2. Ensure .env exists in local-backend
const envPath = path.join(backendDir, '.env');
const envExamplePath = path.join(backendDir, '.env.example');
if (!fs.existsSync(envPath)) {
  console.log('[Setup] local-backend/.env not found. Copying from .env.example...');
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
  } else {
    // Write a default env
    const defaultEnv = `# Supabase Configuration
SUPABASE_URL=https://replace-with-your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-your-service-role-key

# Storage Bucket Name
SUPABASE_BUCKET=omnisearch-files

# Directory to watch for documents
WATCH_DIR=./docs

# Path to the local SQLite database file
DATABASE_URL=omnisearch.db
`;
    fs.writeFileSync(envPath, defaultEnv);
  }
} else {
  console.log('[Setup] local-backend/.env configuration already exists.');
}

// 3. Install packages & run migrations
try {
  console.log('\n[Setup] Verifying and installing local-backend dependencies...');
  execSync('npm install', { cwd: backendDir, stdio: 'inherit' });

  console.log('\n[Setup] Running local-backend SQLite database migrations...');
  execSync('npm run db:migrate', { cwd: backendDir, stdio: 'inherit' });

  console.log('\n[Setup] Verifying and installing remote-client dependencies...');
  execSync('npm install', { cwd: clientDir, stdio: 'inherit' });

  console.log('\n[Setup] Building the production-optimized frontend client...');
  execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });

  console.log('\n==============================================');
  console.log('   ✓ Setup Completed Successfully!            ');
  console.log('==============================================');
  console.log('\nTo run the application:');
  console.log('1. Run the local backend daemon:');
  console.log('   cd local-backend && npm run dev');
  console.log('\n2. Run the PWA static client:');
  console.log('   cd remote-client && npx serve -l 3000 out');
  console.log('\nOpen http://localhost:3000 in your browser to start searching!\n');

} catch (err) {
  console.error('\n[Setup Error] Auto-configuration failed:', err.message);
  process.exit(1);
}
