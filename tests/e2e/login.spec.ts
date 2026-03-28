import { test, expect } from '@playwright/test';

test.describe('Auth flows', () => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  test('login using email/password', async ({ page }) => {
    if (!email || !password) {
      test.skip('Missing TEST_USER_EMAIL/TEST_USER_PASSWORD env vars');
    }

    await page.goto('/');

    // try to find a login link or button
    const loginLink = page.locator('a:has-text("Log in"), a:has-text("Zaloguj"), button:has-text("Log in"), button:has-text("Zaloguj")');
    if (await loginLink.count() > 0) {
      await loginLink.first().click();
    }

    const emailField = page.locator('input[type="email"], input[name="email"], input[placeholder*="email"]');
    await expect(emailField).toBeVisible({ timeout: 5000 });
    await emailField.fill(email);

    const passField = page.locator('input[type="password"], input[name="password"], input[placeholder*="has42o"]');
    await expect(passField).toBeVisible();
    await passField.fill(password);

    const submitBtn = page.locator('button:has-text("Log in"), button:has-text("Zaloguj"), button[type="submit"]');
    await submitBtn.first().click();

    await page.waitForLoadState('networkidle');

    const profileLink = page.getByRole('link', { name: /Profile|Profil/i });
    await expect(profileLink).toBeVisible({ timeout: 10000 });
  });
});
