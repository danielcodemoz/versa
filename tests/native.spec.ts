import { expect, test, type Page } from '@playwright/test'
import { samplePdf } from '../src/sample'

async function mockWindows(page: Page) {
  const source = Array.from(new Uint8Array(await samplePdf().arrayBuffer()))
  await page.addInitScript(source => {
    const callbacks = new Map<number, (event: { payload: unknown }) => void>()
    const listeners = new Map<string, number>()
    const calls: Array<{ command: string; header?: string; content?: string }> = []
    const mocked = {
      isTauri: true,
      mockCalls: calls,
      mockOffer: (event: string, payload: unknown) => callbacks.get(listeners.get(event)!)?.({ payload }),
      __TAURI_INTERNALS__: {
        transformCallback(callback: (event: { payload: unknown }) => void) {
          const id = callbacks.size + 1
          callbacks.set(id, callback)
          return id
        },
        async invoke(command: string, args: { event: string; handler: number } | Uint8Array) {
          if (command === 'plugin:event|listen' && !(args instanceof Uint8Array)) {
            listeners.set(args.event, args.handler)
            return args.handler
          }
          if (command === 'save_result' && args instanceof Uint8Array) {
            const raw = new TextDecoder().decode(args)
            const split = raw.indexOf('\n')
            calls.push({ command, header: raw.slice(0, split), content: raw.slice(split + 1) })
            return { id: 50, name: 'ficha (Versa).txt' }
          }
          calls.push({ command })
          if (command === 'pick') return { id: 12, entries: [{ name: 'ficha.pdf', size: source.length }], x: 0, y: 0, problem: null }
          if (command === 'read_file') return new Uint8Array(source).buffer
          if (command === 'history') return [{ id: 44, name: 'anterior (Versa).pdf' }]
          if (command === 'startup') return false
          if (command === 'output_folder') return null
        },
      },
    }
    Object.assign(window, mocked)
  }, source)
  return source
}

test('the desktop wheel saves the output through native IPC and exposes result actions', async ({ page }) => {
  await mockWindows(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/desktop.html?desktop=main')
  await expect(page.getByRole('heading', { name: 'Últimas conversões' })).toBeVisible()
  await page.getByRole('button', { name: 'Escolher ficheiros', exact: true }).last().click()
  await expect(page.locator('.wheel-status')).toHaveText('Ficheiros verificados')
  await page.locator('.wheel-buttons [data-slice=pdf]').click()
  await page.locator('.wheel-buttons [data-slice=pdf-text]').click()
  await expect(page.locator('.wheel-message')).toContainText('ficha (Versa).txt')
  await page.locator('.wheel-message [data-reveal]').click()
  const calls = await page.evaluate(() => (window as unknown as { mockCalls: { command: string; header?: string; content?: string }[] }).mockCalls)
  const saved = calls.find(call => call.command === 'save_result')
  expect(JSON.parse(saved!.header!)).toEqual({ id: 12, extension: 'txt', english: false })
  expect(saved?.content).toContain('Versa - Ficha de exemplo')
  expect(calls.some(call => call.command === 'open_result')).toBeTruthy()
})

test('the gesture overlay preflights a native file, opens the sub-ring, and accepts the drop', async ({ page }) => {
  const file = await mockWindows(page)
  await page.setViewportSize({ width: 510, height: 550 })
  await page.goto('/desktop.html?desktop=gesture')
  await expect(page.locator('html')).toHaveClass(/native-app/)
  await page.waitForFunction(() => {
    const windowWithCalls = window as unknown as { mockOffer: unknown }
    return Boolean(windowWithCalls.mockOffer && document.querySelector('.wheel-buttons [data-slice=pdf]'))
  })
  const box = (await page.locator('.wheel-buttons [data-slice=pdf]').boundingBox())!
  const offer = { id: 12, entries: [{ name: 'ficha.pdf', size: file.length }], problem: null, x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.evaluate(offer => {
    const { mockOffer } = window as unknown as { mockOffer: (event: string, payload: unknown) => void }
    mockOffer('versa-drag-enter', offer)
  }, offer)
  await expect(page.locator('.lab')).toHaveClass(/is-dragging/)
  await expect(page.locator('.wheel')).toHaveClass(/is-subring/)
  await expect(page.locator('.wheel-status')).toHaveText('Ficheiros verificados')
  const target = (await page.locator('.wheel-buttons [data-slice=pdf-text]').boundingBox())!
  await page.evaluate(drop => {
    const { mockOffer } = window as unknown as { mockOffer: (event: string, payload: unknown) => void }
    mockOffer('versa-drag-over', [drop.x, drop.y])
    mockOffer('versa-drag-drop', drop)
  }, { ...offer, id: 13, x: target.x + target.width / 2, y: target.y + target.height / 2 })
  await expect(page.locator('.wheel-message')).toContainText('ficha (Versa).txt')
})
