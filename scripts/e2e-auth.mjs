// Browser end-to-end check of the auth guard, with no real Supabase.
// Build and start the app pointed at an unreachable Supabase, e.g.
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build && npm start
//   BASE_URL=http://localhost:3000 npm run test:e2e
// PLAYWRIGHT_CHROMIUM_PATH can point at a preinstalled Chromium binary.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://localhost:3000';
const protectedPaths = ['/today', '/dashboard', '/calendar', '/inbox', '/projects', '/skills', '/history', '/review', '/settings', '/settings/notifications', '/plans/11111111-1111-4111-8111-111111111111', '/history/export'];
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const errors = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const home = await page.goto(base);
  assert.equal(home.status(), 200, 'landing page renders');

  for (const path of protectedPaths) {
    const res = await page.goto(base + path);
    await page.waitForURL(url=>url.pathname==='/login',{timeout:20000});
    assert.equal(new URL(page.url()).pathname, '/login', `${path} redirects to /login (got ${page.url()})`);
    assert.equal(res.status(), 200, `${path} ends on a working login page`);
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  }

  // A forged/garbage session cookie must not grant access or crash the guard.
  const host = new URL(base).hostname;
  await context.addCookies([
    { name: 'sb-127-auth-token', value: 'base64-bm90LWEtc2Vzc2lvbg', domain: host, path: '/' },
    { name: 'sb-127-auth-token', value: 'garbage', domain: host, path: '/x' }
  ]);
  await page.goto(base + '/dashboard');
  await page.waitForURL(url=>url.pathname==='/login',{timeout:20000});
  assert.equal(new URL(page.url()).pathname, '/login', 'forged cookie still redirected');
  await context.clearCookies();

  // Browser validation keeps an empty form from submitting.
  await page.goto(base + '/login');
  await page.getByRole('button', { name: 'Login' }).click();
  assert.equal(new URL(page.url()).search, '', 'empty form is not submitted');

  // With Supabase unreachable, login reports an error instead of a 500.
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('status').waitFor({ timeout: 20000 });
  assert.equal(new URL(page.url()).pathname, '/login', 'failed login stays on /login');
  assert.match(await page.getByRole('status').innerText(), /Couldn't reach the sign-in service/, 'actionable error, not raw "fetch failed"');

  // Narrow viewport: no horizontal page scroll on the login page.
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `horizontal overflow at 390px: ${overflow}px`);

  assert.deepEqual(errors, [], 'no console or page errors');
  console.log(`PASS: ${protectedPaths.length} protected routes redirect to /login, forged cookie rejected, empty form blocked, unreachable Supabase login shows a message, 390px`);
} finally {
  await browser.close();
}
