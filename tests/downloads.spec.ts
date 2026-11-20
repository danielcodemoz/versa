import { expect, test } from '@playwright/test'

test('the Windows button opens a bilingual download page that fits 390px', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('link', { name: 'Descarregar para Windows' }).click()
  await expect(page).toHaveURL(/\/downloads\/$/)
  await expect(page.getByRole('heading', { name: 'Versa para Windows' })).toBeVisible()
  await expect(page.locator('.release-actions a').first()).toHaveAttribute('href', /^https:\/\/github\.com\/danielcodemoz\/versa\/releases/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'Mudar para inglês' }).click()
  await expect(page.getByRole('heading', { name: 'Versa for Windows' })).toBeVisible()
  await page.getByRole('button', { name: 'Change theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(errors).toEqual([])
})
