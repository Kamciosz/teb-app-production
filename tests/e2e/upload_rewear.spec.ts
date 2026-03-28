import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

test('rewear upload flow', async ({ page }, info) => {
  const consoleLogs: Array<any> = []
  const networkEvents: Array<any> = []

  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }))
  page.on('pageerror', err => consoleLogs.push({ type: 'pageerror', text: err.message }))
  page.on('request', req => networkEvents.push({ type: 'request', url: req.url(), method: req.method(), postData: req.postData() }))
  page.on('response', async res => {
    const evt: any = { type: 'response', url: res.url(), status: res.status() }
    try { evt.body = await res.text() } catch (e) {}
    networkEvents.push(evt)
  })

  // Mock ImageKit auth & upload to make the test deterministic and not rely on real keys
  await page.route('**/api/imagekit-auth**', async route => {
    const body = JSON.stringify({
      publicKey: 'public_test',
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/test',
      signature: 'testsig',
      token: 'testtoken',
      expire: Math.floor(Date.now() / 1000) + 600
    })
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' }, body })
  })

  await page.route('**/upload.imagekit.io/api/v1/files/upload**', async route => {
    const body = JSON.stringify({ url: (process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/test') + '/tmp_uploads/test.png', filePath: '/tmp_uploads/test.png' })
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' }, body })
  })

  const base = process.env.BASE_URL || 'http://localhost:4173'
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  const imagePath = process.env.TEST_IMAGEPath || path.resolve(process.cwd(), 'tmp_uploads/test.png')

  if (!email || !password) {
    test.skip(true, 'Missing TEST_USER_EMAIL/TEST_USER_PASSWORD env vars')
  }

  await page.goto(base, { waitUntil: 'networkidle' })

  // Fill login form
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForLoadState('networkidle')

  // Go to rewear and open modal
  await page.goto(`${base}/rewear`, { waitUntil: 'networkidle' })
  await page.click('button.fixed.bottom-24.right-6, button[aria-label="add"]', { timeout: 5000 }).catch(() => page.click('button.bg-primary.rounded-full'))
  const form = page.locator('form:visible')
  await expect(form).toBeVisible({ timeout: 5000 })

  // Upload file
  const fileInput = form.locator('input[type="file"]')
  await expect(fileInput).toHaveCount(1)
  // Wait for ImageKit auth and upload requests (either to our auth endpoint or ImageKit upload endpoint)
  const uploadRespPromise = page.waitForResponse(r => (r.url().includes('/api/imagekit-auth') || r.url().includes('upload.imagekit.io/api/v1/files/upload')) && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null)
  await fileInput.setInputFiles(imagePath)
  const uploadResp = await uploadRespPromise
  let publicUrl: string | null = null
  if (uploadResp) {
    try { const json = await uploadResp.json(); publicUrl = json.url || json.publicUrl || json.public_url || null } catch (e) {}
  }

  // Fill required fields and submit
  const title = `E2E Test Item ${Date.now()}`
  await form.locator('input[type="text"]').first().fill(title)
  await form.locator('input[type="number"]').first().fill('1')
  await form.locator('textarea').first().fill('E2E test description')

  const insertRespPromise = page.waitForResponse(r => r.url().includes('rewear_posts') && (r.request().method() === 'POST' || r.request().method() === 'POST'), { timeout: 15000 }).catch(() => null)
  await form.locator('button[type="submit"]').click()
  const insertResp = await insertRespPromise

  // Check DOM for the new item
  let appeared = false
  try {
    await page.waitForSelector(`text=${title}`, { timeout: 10000 })
    appeared = true
  } catch (e) { appeared = false }

  // Save screenshot and result JSON
  const screenshotPath = path.join(process.cwd(), 'reports', `upload_rewear_${Date.now()}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  const result = {
    success: appeared || !!insertResp,
    publicUrl,
    uploadResponse: uploadResp ? { url: uploadResp.url(), status: uploadResp.status() } : null,
    insertResponse: insertResp ? { url: insertResp.url(), status: insertResp.status(), body: await (insertResp.text().catch(() => null)) } : null,
    consoleLogs,
    networkEvents,
  }
  const outPath = path.join(process.cwd(), 'reports', `upload_rewear_result_${Date.now()}.json`)
  fs.mkdirSync(path.join(process.cwd(), 'reports'), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log('RESULT_FILE:', outPath)
  console.log('PUBLIC_URL:', publicUrl || '—')

  expect(result.success).toBeTruthy()
})
