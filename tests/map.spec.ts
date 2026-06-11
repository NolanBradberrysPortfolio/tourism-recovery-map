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
  await expect(page.getByLabel('From year')).toHaveValue('2019')
  await expect(page.getByLabel('To year')).toHaveValue('2024')
  await expect(page.getByLabel('Search countries')).toBeVisible()
  await expect(page.locator('.legend')).toContainText('% change')
  await expect(page.locator('.legend')).toContainText('Missing selected year')
  await expect(page.locator('.legend')).toContainText('Latest before to year')
  const pathCount = await page.locator('.country-path').count()
  expect(pathCount).toBeGreaterThan(150)
})

test('switches from and to years and keeps the layout inside the viewport', async ({ page }) => {
  await page.getByLabel('Search countries').fill('Japan')
  await page.getByLabel('Japan country search option').click()
  await expect(page.locator('.detail-panel')).toContainText('Japan')
  await expect(page.locator('.detail-panel')).toContainText('+16%')
  await expect(page.locator('.detail-panel')).toContainText('31.9M in 2019')
  await expect(page.locator('.detail-panel')).toContainText('36.9M in 2024')
  await expect(page.locator('.detail-panel')).toContainText('4,989,000')
  await page.getByLabel('To year').selectOption('2022')
  await expect(page.locator('.detail-panel')).toContainText('3.8M in 2022')
  await expect(page.locator('.detail-panel')).toContainText('-88%')
  await page.getByLabel('From year').selectOption('2020')
  await expect(page.locator('.legend')).toContainText('2020 to 2022')
  await expect(page.locator('.detail-panel')).toContainText('4.1M in 2020')
  await expect(page.locator('.detail-panel')).toContainText('-6.9%')
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  )
  expect(noHorizontalOverflow).toBe(true)
})

test('reports reverse, same-year, and missing selected-year states', async ({ page }) => {
  const search = page.getByLabel('Search countries')

  await search.fill('Kazakhstan')
  await page.getByLabel('Kazakhstan country search option').click()
  await expect(page.locator('.detail-panel')).toContainText('No 2019 data')
  await expect(page.locator('.detail-panel')).toContainText('10.4M in 2024')

  await page.getByLabel('From year').selectOption('2024')
  await page.getByLabel('To year').selectOption('2019')
  await search.fill('Japan')
  await page.getByLabel('Japan country search option').click()
  await expect(page.locator('.legend')).toContainText('2024 to 2019')
  await expect(page.locator('.detail-panel')).toContainText('Decrease from 2024 to 2019')
  await expect(page.locator('.detail-panel')).toContainText('36.9M in 2024')
  await expect(page.locator('.detail-panel')).toContainText('31.9M in 2019')

  await page.getByLabel('From year').selectOption('2024')
  await page.getByLabel('To year').selectOption('2024')
  await search.fill('Australia')
  await page.getByLabel('Australia country search option').click()
  await expect(page.locator('.legend')).toContainText('2024 to 2024')
  await expect(page.locator('.detail-panel')).toContainText('No 2024 data')
  await expect(page.locator('.detail-panel')).not.toContainText('No 2024 or 2024 data')
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
  await page.getByLabel('To year').selectOption('2024')
  const compareStat = page.locator('.stat-grid div').filter({ hasText: 'To' })
  await expect(page.locator('.detail-panel')).toContainText('No 2024 data')
  await expect(compareStat).toContainText('No source')
  await expect(compareStat).not.toContainText('World Bank WDI')

  await search.fill('China')
  await page.getByLabel('China country search option').click()
  await expect(page.locator('.detail-panel')).toContainText('China')
  await expect(page.locator('.detail-panel')).toContainText('official 2024 inbound-tourism counts')

  await search.fill('zzzzzz')
  await expect(page.getByText('No matching country')).toBeVisible()
})

test('mobile touch gestures pan and pinch the map and details are easy to close', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'touch gesture regression is mobile-focused')

  const session = await page.context().newCDPSession(page)
  const touch = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: Array<{ x: number; y: number; id: number }> = [],
  ) => {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point) => ({
        x: point.x,
        y: point.y,
        id: point.id,
        radiusX: 2,
        radiusY: 2,
      })),
    })
  }
  const mapTransform = () => page.locator('.country-layer').getAttribute('transform')
  const mapScale = async () => {
    const transform = await mapTransform()
    return Number(transform?.match(/scale\(([^)]+)\)/)?.[1] ?? 1)
  }

  const initialScale = await mapScale()
  await touch('touchStart', [
    { x: 165, y: 292, id: 1 },
    { x: 225, y: 292, id: 2 },
  ])
  await touch('touchMove', [
    { x: 132, y: 292, id: 1 },
    { x: 258, y: 292, id: 2 },
  ])
  await touch('touchEnd')
  await expect.poll(mapScale).toBeGreaterThan(initialScale + 0.2)

  const beforePan = await mapTransform()
  await touch('touchStart', [{ x: 206, y: 306, id: 3 }])
  await touch('touchMove', [{ x: 260, y: 342, id: 3 }])
  await touch('touchEnd')
  await expect.poll(mapTransform).not.toBe(beforePan)

  await page.getByLabel('Search countries').fill('Japan')
  await page.getByLabel('Japan country search option').click()
  await expect(page.locator('.detail-panel')).toContainText('Japan')
  await page.getByLabel('Close selected country details').click()
  await expect(page.locator('.detail-panel')).toHaveCount(0)

  await page.getByLabel('Search countries').fill('Japan')
  await page.getByLabel('Japan country search option').click()
  await expect(page.locator('.detail-panel')).toContainText('Japan')
  await page.getByLabel('Close map details').click()
  await expect(page.locator('.detail-panel')).toHaveCount(0)
})
