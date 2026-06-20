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

  try {
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Wait for the state to settle
    await page.waitForTimeout(2000);

    // 1. Get header titles and statuses
    // Let's locate using text or class since we don't have IDs
    const bodyText = await page.innerText('body');
    console.log('\n--- Page Body Text Snippet ---');
    console.log(bodyText.substring(0, 1000));
    console.log('------------------------------');

    // 2. Locate the settings button (it has a Lucide Settings icon inside it, and is a button)
    console.log('\nClicking settings button...');
    
    // Find the button with settings icon or look at the header
    // The header is at the top. Let's find settings button.
    // The second button in header is settings. Let's select buttons and print.
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`Found ${buttonCount} buttons on the page.`);
    for (let i = 0; i < buttonCount; i++) {
      const txt = await buttons.nth(i).innerText();
      console.log(`Button ${i}: "${txt}"`);
    }

    // The settings button is the last one in the header, let's just click the button that has no text (only settings icon)
    // Or we can find by index. Let's try clicking the second button (index 1).
    if (buttonCount > 1) {
      await buttons.nth(1).click();
      await page.waitForTimeout(1000);
      
      const newBodyText = await page.innerText('body');
      console.log('\n--- Page Body Text after Clicking Settings ---');
      console.log(newBodyText.substring(0, 1000));
      console.log('---------------------------------------------');
    }

  } catch (err) {
    console.error('Test execution failed:', err.stack || err.message);
  } finally {
    await browser.close();
  }
}

run();
