import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from '../config.js';

const config = loadConfig();

// Initialize the Supabase client with the service role key for admin privileges
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    persistSession: false
  }
});

/**
 * Determines the MIME Content-Type based on file extension
 */
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf': return 'application/pdf';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.txt': return 'text/plain';
    case '.md': return 'text/markdown';
    case '.json': return 'application/json';
    case '.csv': return 'text/csv';
    case '.log': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

/**
 * Uploads a local raw file to the Supabase storage bucket.
 * Generates a signed URL with a 5-year expiry.
 * Returns the signed cloud URL and the internal cloud path (for later deletions).
 */
export async function uploadRawFile(filePath: string): Promise<{ cloudUrl: string; cloudPath: string }> {
  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  
  if (config.isOffline) {
    console.log(`[Sync (Offline Mode)] Skipping file upload for ${fileName}. Using local file URL.`);
    return {
      cloudUrl: `file://${path.resolve(filePath)}`,
      cloudPath: `local/${Date.now()}_${fileName}`
    };
  }

  // Create a structured folder path inside the bucket
  const cloudPath = `raw/${Date.now()}_${fileName}`;
  const contentType = getContentType(filePath);

  console.log(`[Sync] Uploading ${fileName} to bucket (${contentType})...`);
  
  const { error } = await supabase.storage
    .from(config.supabaseBucket)
    .upload(cloudPath, fileBuffer, {
      contentType,
      upsert: true
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  // Generate a signed URL valid for 5 years (157,680,000 seconds)
  // This allows direct serverless streaming on mobile browsers without needing active middleware.
  const { data, error: urlError } = await supabase.storage
    .from(config.supabaseBucket)
    .createSignedUrl(cloudPath, 157680000);

  if (urlError || !data?.signedUrl) {
    throw new Error(`Failed to generate signed URL: ${urlError?.message || 'Empty response'}`);
  }

  return {
    cloudUrl: data.signedUrl,
    cloudPath
  };
}

/**
 * Deletes a file from Supabase storage using its cloud path.
 */
export async function deleteRawFile(cloudPath: string): Promise<void> {
  if (config.isOffline) {
    console.log(`[Sync (Offline Mode)] Skipping file deletion from cloud bucket: ${cloudPath}`);
    return;
  }

  console.log(`[Sync] Deleting file from storage bucket: ${cloudPath}`);
  const { error } = await supabase.storage
    .from(config.supabaseBucket)
    .remove([cloudPath]);

  if (error) {
    console.error(`[Sync Warning] Failed to delete cloud file ${cloudPath}: ${error.message}`);
  }
}

