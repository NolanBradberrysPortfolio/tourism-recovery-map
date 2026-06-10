import { expect, test } from '@playwright/test'

const baselines = ['2019', '2022', '2024', 'prior']
const countries = ['France', 'Japan', 'Brazil', 'Albania', 'United States', 'Thailand']

test('mobile adversarial interaction loop', async ({ page }, testInfo) => {
  const iteration = testInfo.repeatEachIndex
  const baseline = baselines[iteration % baselines.length]
  const country = countries[iteration % countries.length]

  await page.goto('/')
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-pane svg path').length > 150)
  await page.getByLabel('Comparison baseline').selectOption(baseline)
  await page.getByLabel('Search countries').fill(country)
  await page.getByRole('button', { name: `Select ${country}`, exact: true }).click()
  await expect(page.locator('.detail-panel')).toContainText(country)

  if (iteration % 3 === 0) {
    await page.getByLabel('Open data notes').click()
    await expect(page.locator('.source-panel')).toContainText('UN Tourism')
    await page.getByLabel('Close data notes').click()
  }

  if (iteration % 2 === 0) {
    await page.locator('.leaflet-control-zoom-in').click()
    await page.locator('.leaflet-control-zoom-out').click()
  }

  const checks = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    visiblePaths: document.querySelectorAll('.leaflet-pane svg path').length,
    detailVisible: Boolean(document.querySelector('.detail-panel')),
  }))

  expect(checks.horizontalOverflow).toBeLessThanOrEqual(1)
  expect(checks.visiblePaths).toBeGreaterThan(150)
  expect(checks.detailVisible).toBe(true)
})
