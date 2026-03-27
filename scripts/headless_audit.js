#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const base = process.env.PLAYWRIGHT_BASE_URL || 'https://teb-app-production.vercel.app';
const routes = ['/', '/feed', '/rewear', '/tebtalk', '/groups', '/profile'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const outBase = path.join(process.cwd(), 'reports');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(outBase, `headless-audit-${ts}`);
  await fs.promises.mkdir(outDir, { recursive: true });
  console.log('Audit output dir:', outDir);

  for (const route of routes) {
    const page = await browser.newPage();
    const logs = [];

    page.on('console', msg => {
      const loc = msg.location ? msg.location() : {};
      const entry = { type: 'console', level: msg.type(), text: msg.text(), location: loc };
      logs.push(entry);
      console.log(`[${route}] console.${msg.type()} ${msg.text()}`);
    });

    page.on('pageerror', err => {
      const entry = { type: 'pageerror', message: err.message, stack: err.stack };
      logs.push(entry);
      console.error(`[${route}] pageerror`, err.message);
    });

    try {
      const url = new URL(route, base).toString();
      console.log('Visiting', url);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);

      const safeName = (route === '/' ? 'root' : route.replace(/\//g, '_').replace(/^_/, ''));
      const screenshot = path.join(outDir, `${safeName}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });

      const logFile = path.join(outDir, `console_${safeName}.json`);
      await fs.promises.writeFile(logFile, JSON.stringify(logs, null, 2));
      await page.close();
      console.log(`Saved ${screenshot} and ${logFile}`);
    } catch (err) {
      console.error(`Error on ${route}:`, err);
      try { await page.close(); } catch (e) {}
    }
  }

  await browser.close();
  console.log('Headless audit complete.');
})();
