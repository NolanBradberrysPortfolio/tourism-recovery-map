import { expect, test } from '@playwright/test'

const yearPairs = [
  ['2019', '2024'],
  ['2019', '2022'],
  ['2020', '2024'],
  ['2022', '2024'],
  ['2024', '2019'],
  ['2024', '2024'],
]
const countries = ['France', 'Japan', 'Brazil', 'Albania', 'United States', 'Thailand', 'Kazakhstan', 'Australia']

test('mobile adversarial interaction loop', async ({ page }, testInfo) => {
  const iteration = testInfo.repeatEachIndex
  const [fromYear, toYear] = yearPairs[iteration % yearPairs.length]
  const country = countries[iteration % countries.length]

  await page.goto('/')
  await page.waitForFunction(() => document.querySelectorAll('.country-path').length > 150)
  await page.getByLabel('From year').selectOption(fromYear)
  await page.getByLabel('To year').selectOption(toYear)
  await page.getByLabel('Search countries').fill(country)
  await page.getByLabel(`${country} country search option`).click()
  await expect(page.locator('.detail-panel')).toContainText(country)
  if (fromYear === toYear) {
    await expect(page.locator('.detail-panel')).not.toContainText(`No ${fromYear} or ${toYear} data`)
  }

  if (iteration % 3 === 0) {
    await page.getByLabel('Open data notes').click()
    await expect(page.locator('.source-panel')).toContainText('UN Tourism')
    await page.getByLabel('Close data notes').click()
  }

  if (iteration % 2 === 0) {
    await page.getByLabel('Zoom in').click()
    await page.getByLabel('Zoom out').click()
  }

  const checks = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    visiblePaths: document.querySelectorAll('.country-path').length,
    detailVisible: Boolean(document.querySelector('.detail-panel')),
  }))

  expect(checks.horizontalOverflow).toBeLessThanOrEqual(1)
  expect(checks.visiblePaths).toBeGreaterThan(150)
  expect(checks.detailVisible).toBe(true)
})
