import { expect, test, type Page } from '@playwright/test'
import { samplePdf } from '../src/sample'

async function mockWindows(page: Page, sources?: number[][]) {
  const source = Array.from(new Uint8Array(await samplePdf().arrayBuffer()))
  await page.addInitScript(({ source, sources }) => {
    let maximized = false
    const label = location.search.includes('gesture') ? 'gesture' : 'main'
    const callbacks = new Map<number, (event: { payload: unknown }) => void>()
    const listeners = new Map<string, number>()
    const calls: Array<{ command: string; header?: string; content?: string }> = []
    const mocked = {
      isTauri: true,
      mockCalls: calls,
      mockOffer: (event: string, payload: unknown) => callbacks.get(listeners.get(event)!)?.({ payload }),
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label } },
        transformCallback(callback: (event: { payload: unknown }) => void) {
          const id = callbacks.size + 1
          callbacks.set(id, callback)
          return id
        },
        async invoke(command: string, args: { event: string; handler: number; target?: { kind: string; label: string }; index?: number } | Uint8Array) {
          if (command === 'plugin:event|listen' && !(args instanceof Uint8Array)) {
            if (args.event.startsWith('versa-drag-') && (args.target?.kind !== 'Window' || args.target.label !== label)) {
              throw new Error('Native drag listeners must target their own window')
            }
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
          if (command === 'plugin:window|is_maximized') return maximized
          if (command === 'plugin:window|toggle_maximize') maximized = !maximized
          if (command === 'pick') return { id: 12, entries: [{ name: 'ficha.pdf', size: source.length }], x: 0, y: 0, problem: null }
          if (command === 'read_file' && !(args instanceof Uint8Array)) {
            return new Uint8Array(sources?.[args.index ?? 0] ?? source).buffer
          }
          if (command === 'history') return [{ id: 44, name: 'anterior (Versa).pdf' }]
          if (command === 'startup') return false
          if (command === 'output_folder') return null
        },
      },
    }
    Object.assign(window, mocked)
  }, { source, sources })
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
  }, { ...offer, x: target.x + target.width / 2, y: target.y + target.height / 2 })
  await expect(page.locator('.wheel-message')).toContainText('ficha (Versa).txt')
})

test('a native drop on the desktop background stages the file and saves against its source', async ({ page }) => {
  const source = await mockWindows(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 460, height: 640 })
  await page.goto('/desktop.html?desktop=main')
  await expect(page.getByRole('heading', { name: 'Últimas conversões' })).toBeVisible()
  const offer = { id: 17, entries: [{ name: 'ficha.pdf', size: source.length }], problem: null, x: 12, y: 64 }
  await page.evaluate(offer => {
    const { mockOffer } = window as unknown as { mockOffer: (name: string, payload: unknown) => void }
    mockOffer('versa-drag-enter', offer)
    mockOffer('versa-drag-drop', offer)
  }, offer)
  await expect(page.locator('.wheel-status')).toHaveText('Ficheiros verificados')
  await expect(page.locator('.wheel-centre')).toContainText('ficha.pdf')
  await page.locator('.wheel-buttons [data-slice=pdf]').click()
  await expect(page.locator('.lab-heading [data-back]')).toBeInViewport()
  await page.locator('.wheel-buttons [data-slice=pdf-text]').click()
  await expect(page.locator('.wheel-message')).toContainText('ficha (Versa).txt')
  const calls = await page.evaluate(() => (window as unknown as { mockCalls: { command: string; header?: string }[] }).mockCalls)
  expect(calls.filter(call => call.command === 'read_file')).toHaveLength(1)
  expect(JSON.parse(calls.find(call => call.command === 'save_result')!.header!)).toMatchObject({ id: 17, extension: 'txt' })
})

test('the Versa title bar provides drag and window controls and blocks drop navigation', async ({ page }) => {
  await mockWindows(page)
  await page.setViewportSize({ width: 460, height: 640 })
  await page.goto('/desktop.html?desktop=main')
  const titlebar = page.locator('.versa-titlebar')
  await expect(titlebar.locator('.versa-titlebar-drag')).toHaveAttribute('data-tauri-drag-region', '')
  await expect(titlebar.getByRole('img', { name: 'Versa' })).toBeVisible()
  await titlebar.getByRole('button', { name: 'Maximizar', exact: true }).click()
  await expect(titlebar.getByRole('button', { name: 'Restaurar janela' })).toBeVisible()
  await titlebar.getByRole('button', { name: 'Restaurar janela' }).click()
  await expect(titlebar.getByRole('button', { name: 'Maximizar', exact: true })).toBeVisible()
  await titlebar.getByRole('button', { name: 'Minimizar' }).click()
  await titlebar.getByRole('button', { name: 'Fechar janela' }).click()
  await titlebar.locator('[data-language-switch]').click()
  await expect(titlebar.getByRole('button', { name: 'Close window' })).toBeVisible()
  const result = await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.setData('text/uri-list', 'https://example.com/')
    const stopped = ['dragover', 'drop'].map(type => !document.body.dispatchEvent(new DragEvent(type, {
      dataTransfer: transfer, bubbles: true, cancelable: true,
    })))
    const { mockCalls } = window as unknown as { mockCalls: { command: string }[] }
    return { stopped, commands: mockCalls.map(call => call.command) }
  })
  expect(result.stopped).toEqual([true, true])
  expect(result.commands).toEqual(expect.arrayContaining(['plugin:window|minimize', 'plugin:window|toggle_maximize', 'plugin:window|close']))
})

test('a native drop on the initial wheel opens the file category with the source loaded', async ({ page }) => {
  const source = await mockWindows(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 460, height: 640 })
  await page.goto('/desktop.html?desktop=main')
  await expect(page.getByRole('heading', { name: 'Últimas conversões' })).toBeVisible()
  const centre = (await page.locator('.wheel-centre').boundingBox())!
  await page.evaluate(offer => {
    const { mockOffer } = window as unknown as { mockOffer: (name: string, payload: unknown) => void }
    mockOffer('versa-drag-drop', offer)
  }, { id: 22, entries: [{ name: 'ficha.pdf', size: source.length }], problem: null, x: centre.x + centre.width / 2, y: centre.y + centre.height / 2 })
  await expect(page.locator('.wheel-status')).toHaveText('Ficheiros verificados')
  await expect(page.locator('.wheel')).toHaveClass(/is-subring/)
  await expect(page.locator('.wheel-centre')).toContainText('ficha.pdf')
  await page.locator('.wheel-buttons [data-slice=pdf-text]').click()
  await expect(page.locator('.wheel-message')).toContainText('ficha (Versa).txt')
})

test('JPG and PNG in a native drop open one image category', async ({ page }) => {
  const images = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 2
    return Promise.all(['image/jpeg', 'image/png'].map(async type => {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type))
      return [...new Uint8Array(await blob!.arrayBuffer())]
    }))
  })
  await mockWindows(page, images)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 460, height: 640 })
  await page.goto('/desktop.html?desktop=main')
  await expect(page.getByRole('heading', { name: 'Últimas conversões' })).toBeVisible()
  const centre = (await page.locator('.wheel-centre').boundingBox())!
  const entries = ['a.jpg', 'b.png'].map((name, index) => ({ name, size: images[index].length }))
  await page.evaluate(offer => {
    const { mockOffer } = window as unknown as { mockOffer: (name: string, payload: unknown) => void }
    mockOffer('versa-drag-drop', offer)
  }, { id: 23, entries, problem: null, x: centre.x + centre.width / 2, y: centre.y + centre.height / 2 })
  await expect(page.locator('.wheel-status')).toHaveText('Ficheiros verificados')
  await expect(page.locator('.wheel-centre')).toContainText('2 ficheiros')
  await expect(page.locator('.wheel-buttons [data-slice=image-pdf]')).toBeEnabled()
})
