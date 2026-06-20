import { chromium } from 'playwright';
import path from 'path';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[Browser Error] ${err.stack || err.message}`);
  });

  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });

    console.log('Waiting for the AI model to finish downloading...');
    // We poll the model status text every second until it says "AI local model ready (WASM)."
    let modelReady = false;
    for (let i = 0; i < 45; i++) {
      const bodyText = await page.innerText('body');
      if (bodyText.includes('AI local model ready (WASM).')) {
        modelReady = true;
        console.log('Local AI model is ready!');
        break;
      }
      await page.waitForTimeout(1000);
    }

    if (!modelReady) {
      console.warn('AI model did not load in time. Proceeding anyway...');
    }

    console.log('\nUploading local omnisearch.db SQLite database...');
    const dbPath = 'c:/Users/CP-CODE/Desktop/OMNISEARCH/local-backend/omnisearch.db';
    await page.setInputFiles('input[type="file"]', dbPath);
    await page.waitForTimeout(2000);

    const bodyTextAfterUpload = await page.innerText('body');
    console.log('\n--- Page Body Text after Database Upload ---');
    console.log(bodyTextAfterUpload.substring(0, 1000));
    console.log('--------------------------------------------');

    if (bodyTextAfterUpload.includes('Loaded')) {
      console.log('Database loaded successfully!');
    } else {
      console.error('Failed to load database index.');
      return;
    }

    // Run a semantic search query
    console.log('\nTyping search query: "grandma recipe"...');
    await page.fill('input[placeholder*="Search documents by meaning"]', 'grandma recipe');
    
    console.log('Clicking search...');
    await page.click('button:has-text("Search")');
    
    console.log('Waiting for search results...');
    await page.waitForTimeout(3000);

    const searchResultsText = await page.innerText('body');
    console.log('\n--- Search Results Page Text ---');
    console.log(searchResultsText.substring(0, 1200));
    console.log('--------------------------------');

    // Get the download links and print them
    const links = await page.locator('a[download]');
    const count = await links.count();
    console.log(`\nFound ${count} download links in the search results.`);
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      const text = await links.nth(i).innerText();
      console.log(`Download Link ${i}: "${text}" -> href="${href}"`);
    }

  } catch (err) {
    console.error('Integration test failed:', err.stack || err.message);
  } finally {
    await browser.close();
  }
}

run();
