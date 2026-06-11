import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelectorAll('.country-path').length > 150)
  expect(consoleErrors).toEqual([])
})

test('renders the world choropleth and key controls', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Tourism Recovery Map' })).toBeVisible()
  await expect(page.getByLabel('Comparison year')).toHaveValue('2019')
  await expect(page.getByLabel('Search countries')).toBeVisible()
  await expect(page.locator('.legend')).toContainText('% change')
  await expect(page.locator('.legend')).toContainText('No baseline')
  await expect(page.locator('.legend')).toContainText('Older latest year')
  const pathCount = await page.locator('.country-path').count()
  expect(pathCount).toBeGreaterThan(150)
})

test('switches baselines and keeps the layout inside the viewport', async ({ page }) => {
  await page.getByLabel('Search countries').fill('France')
  await page.getByLabel('France country search option').click()
  await expect(page.locator('.detail-panel')).toContainText('France')
  await page.getByLabel('Comparison year').selectOption('2022')
  await expect(page.locator('.detail-panel')).toContainText('Compare with')
  await page.getByLabel('Comparison year').selectOption('prior')
  await expect(page.locator('.detail-panel')).toContainText('Compare with')
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  )
  expect(noHorizontalOverflow).toBe(true)
})

test('search selects a country and opens data notes', async ({ page }) => {
  await page.getByLabel('Search countries').fill('Japan')
  await page.getByLabel('Japan country search option').click()
  await expect(page.locator('.detail-panel')).toContainText('Japan')
  await expect(page.locator('.detail-panel')).toContainText('Increase')
  await expect(page.locator('.detail-panel')).toContainText('World Bank WDI')
  await expect(page.locator('.detail-context')).toContainText('Color compares')
  await page.getByLabel('Open data notes').click()
  await expect(page.getByRole('heading', { name: 'Data Notes' })).toBeVisible()
  await expect(page.locator('.source-panel')).toContainText('Digital nomad arrivals are not mapped')
  await expect(page.locator('.source-panel')).toContainText('World Bank WDI')
  await expect(page.locator('.source-panel')).toContainText('Searchable records not separately drawn')
  await page.getByLabel('Close data notes').click()
  await expect(page.locator('.source-panel')).toHaveCount(0)
})

test('search supports keyboard navigation and no-results feedback', async ({ page }) => {
  const search = page.getByLabel('Search countries')
  await search.fill('United')
  await expect(page.getByLabel('United Arab Emirates country search option')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await search.press('ArrowDown')
  await expect(page.getByLabel('United Kingdom country search option')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await search.press('Enter')
  await expect(page.locator('.detail-panel')).toContainText('United Kingdom')

  await search.fill('Afghanistan')
  await page.getByLabel('Afghanistan country search option').click()
  await expect(page.locator('.detail-panel')).toContainText('Afghanistan')
  await expect(page.locator('.detail-panel')).toContainText('No tourism series')

  await search.fill('Ivory Coast')
  await expect(page.getByLabel('Ivory Coast country search option')).toContainText('World Bank WDI')
  await page.getByLabel('Ivory Coast country search option').click()
  await page.getByLabel('Comparison year').selectOption('2024')
  const compareStat = page.locator('.stat-grid div').filter({ hasText: 'Compare with' })
  await expect(page.locator('.detail-panel')).toContainText('No 2024 data')
  await expect(compareStat).toContainText('No source')
  await expect(compareStat).not.toContainText('World Bank WDI')

  await search.fill('zzzzzz')
  await expect(page.getByText('No matching country')).toBeVisible()
})
