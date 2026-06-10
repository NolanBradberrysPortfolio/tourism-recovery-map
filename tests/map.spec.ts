import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-pane svg path').length > 150)
  expect(consoleErrors).toEqual([])
})

test('renders the world choropleth and key controls', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Tourism Recovery Map' })).toBeVisible()
  await expect(page.getByLabel('Comparison baseline')).toHaveValue('2019')
  await expect(page.getByLabel('Search countries')).toBeVisible()
  await expect(page.locator('.legend')).toContainText('Decrease')
  await expect(page.locator('.detail-panel')).toContainText('United States')
  const pathCount = await page.locator('.leaflet-pane svg path').count()
  expect(pathCount).toBeGreaterThan(150)
})

test('switches baselines and keeps the layout inside the viewport', async ({ page }) => {
  await page.getByLabel('Comparison baseline').selectOption('2022')
  await expect(page.locator('.detail-panel')).toContainText('Baseline')
  await page.getByLabel('Comparison baseline').selectOption('prior')
  await expect(page.locator('.detail-panel')).toContainText('Baseline')
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  )
  expect(noHorizontalOverflow).toBe(true)
})

test('search selects a country and opens data notes', async ({ page }) => {
  await page.getByLabel('Search countries').fill('Japan')
  await page.getByRole('button', { name: 'Select Japan' }).click()
  await expect(page.locator('.detail-panel')).toContainText('Japan')
  await page.getByLabel('Open data notes').click()
  await expect(page.getByRole('heading', { name: 'Data Notes' })).toBeVisible()
  await expect(page.locator('.source-panel')).toContainText('Digital nomad arrivals are not mapped')
  await page.getByLabel('Close data notes').click()
  await expect(page.locator('.source-panel')).toHaveCount(0)
})
