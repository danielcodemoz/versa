import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { samplePdf } from '../src/sample'

test('the keyboard opens the sub-ring, runs a sample, and downloads the result', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Experimentar com exemplo' }).click()
  await expect(page.getByRole('status')).toHaveText('Ficheiros verificados')
  const pdf = page.locator('.wheel-buttons [data-slice=pdf]')
  await pdf.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.wheel')).toHaveClass(/is-subring/)
  await page.keyboard.press('Escape')
  await expect(pdf).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.wheel-buttons [data-slice=pdf-word]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('Conversão concluída')
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Descarregar', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('ficha-de-exemplo (Versa).docx')
  await page.getByRole('button', { name: 'Converter outro' }).click()
  await expect(page.getByRole('button', { name: 'Escolher ficheiros', exact: true }).last()).toBeFocused()
  expect(errors).toEqual([])
})

test('drop enters preflight, locks corrupt inputs, and supports multiple PDF files', async ({ page }) => {
  await page.goto('/')
  const target = page.locator('.wedge-face[data-hit=pdf]')
  const data = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['invalid'], 'broken.pdf', { type: 'application/pdf' }))
    return transfer
  })
  await target.dispatchEvent('dragenter', { dataTransfer: data })
  await expect(page.locator('.drag-shade')).toHaveClass(/visible/)
  await expect(page.locator('.wheel-buttons [data-slice=image]')).toHaveAttribute('aria-disabled', 'true')
  await target.dispatchEvent('dragover', { dataTransfer: data })
  await expect(page.locator('.wheel-centre')).toContainText('PDF → DOCX')
  await target.dispatchEvent('drop', { dataTransfer: data })
  await expect(page.getByRole('status')).toContainText('Ficheiro incompleto ou danificado')
  await expect(page.locator('.wheel-buttons button:not([aria-disabled])')).toHaveCount(0)
  const pdf = Buffer.from(await samplePdf().arrayBuffer())
  await page.locator('input[type=file]').setInputFiles([
    { name: 'one.pdf', mimeType: 'application/pdf', buffer: pdf },
    { name: 'two.pdf', mimeType: 'application/pdf', buffer: pdf },
  ])
  await expect(page.getByRole('status')).toHaveText('Ficheiros verificados')
  await expect(page.locator('.wheel-centre')).toContainText('2 ficheiros')
  await expect(page.locator('.wheel-buttons [data-slice=pdf-merge]')).not.toHaveAttribute('aria-disabled')
})

for (const theme of ['light', 'dark'] as const) {
  test(`390px in ${theme} mode changes language and passes WCAG AA automated checks`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
    await page.getByRole('button', { name: 'Mudar para inglês' }).first().click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.getByRole('button', { name: 'Change theme' }).first().click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'dark' ? 'light' : 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
}
