import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Script to manually login and save auth state
 * Run with: npx ts-node playwright/scripts/manual-login.ts
 *
 * This opens a browser where you can:
 * 1. Login to AAP manually
 * 2. Complete OAuth flow
 * 3. Press Enter to save the auth state
 */
async function manualLogin() {
  const browser = await chromium.launch({
    headless: false, // Open visible browser
    slowMo: 100,
  });

  const context = await browser.newContext({
    baseURL: process.env.BASE_URL || 'https://192.168.124.108',
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  console.log('\n=== MANUAL LOGIN HELPER ===');
  console.log('1. Navigate to the portal and login manually');
  console.log('2. Complete the OAuth flow');
  console.log('3. Verify you see the Templates navigation');
  console.log('4. Press ENTER in this terminal to save the auth state\n');

  // Navigate to home page
  await page.goto('/');

  // Wait for user to complete manual login
  await new Promise<void>(resolve => {
    process.stdin.once('data', () => {
      console.log('\n✓ Saving authentication state...');
      resolve();
    });
  });

  // Save storage state
  const authFile = 'playwright/.auth/user.json';
  await context.storageState({ path: authFile });
  console.log('✓ Authentication state saved to:', authFile);

  // Verify saved state
  const savedState = await context.storageState();
  console.log('\n=== Saved State Summary ===');
  console.log('Cookies:', savedState.cookies.length);
  console.log(
    'LocalStorage items:',
    savedState.origins[0]?.localStorage?.length || 0,
  );

  await browser.close();
  console.log('\n✓ Done! You can now run tests with this authenticated state.');
}

manualLogin().catch(console.error);
