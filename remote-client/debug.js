import { chromium } from 'playwright';

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

  console.log('Navigating to http://localhost:3000...');
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('Navigation completed. Waiting 5 seconds to capture logs...');
    await page.waitForTimeout(5000);
  } catch (err) {
    console.error('Navigation or wait failed:', err.message);
  } finally {
    await browser.close();
  }
}

run();
