import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { available, needsPro, recipes } from '../packages/engine/catalog'
import { runBatch } from '../packages/engine/batch'
import { localName, type Handler } from '../packages/engine/types'
import { activateLicense, isPro, loadLicense, removeLicense, setPro, verifyLicense } from '../packages/engine/license'

// Keys are made with the real tool in a throw-away folder, so the test also covers tools/licence.mjs.
const folder = mkdtempSync(join(tmpdir(), 'versa-licence-'))
const tool = (...args: string[]) => execFileSync('node', ['tools/licence.mjs', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const keygen = tool('keygen', join(folder, 'a')).split('\n').at(-1)!
const publicKey = JSON.parse(keygen) as JsonWebKey
const privateFile = join(folder, 'a', 'versa-licence-private.json')
const sign = (...args: string[]) => tool('sign', privateFile, ...args)
const otherKey = JSON.parse(tool('keygen', join(folder, 'b')).split('\n').at(-1)!) as JsonWebKey

test.beforeEach(() => setPro(false))

test('keygen keeps the private key out of the repository and never overwrites it', () => {
  expect(() => tool('keygen', join(process.cwd(), 'inside'))).toThrow()
  expect(() => tool('keygen', join(folder, 'a'))).toThrow()
  expect(JSON.parse(readFileSync(privateFile, 'utf8')).d).toBeTruthy()
  expect((publicKey as { d?: string }).d).toBeUndefined()
})

test('a signed key verifies and shows who it was issued to', async () => {
  const check = await verifyLicense(sign('--name', 'Escola Nova', '--until', '2099-12-31'), publicKey)
  expect(check).toEqual({ ok: true, payload: { n: 'Escola Nova', p: 'pro', e: '2099-12-31' } })
  expect((await verifyLicense(sign('--name', 'Sem fim'), publicKey)).ok).toBe(true)
})

test('tampered, foreign, expired, malformed and unconfigured keys are refused', async () => {
  const token = sign('--name', 'Ana', '--until', '2099-12-31')
  const [head, body, signature] = token.split('.')
  const forged = Buffer.from(JSON.stringify({ n: 'Ana', p: 'pro' })).toString('base64url')
  expect(await verifyLicense(`${head}.${forged}.${signature}`, publicKey)).toEqual({ ok: false, problem: 'signature' })
  expect(await verifyLicense(token, otherKey)).toEqual({ ok: false, problem: 'signature' })
  expect(await verifyLicense(token, publicKey, new Date('2100-01-01'))).toEqual({ ok: false, problem: 'expired' })
  expect((await verifyLicense(sign('--name', 'Ana', '--until', '2099-12-31'), publicKey, new Date('2099-12-31T12:00:00Z'))).ok).toBe(true)
  for (const bad of ['', 'abc', `${head}.${body}`, `OTHER.${body}.${signature}`, `${head}.%%%.${signature}`]) {
    expect(await verifyLicense(bad, publicKey)).toEqual({ ok: false, problem: 'format' })
  }
  expect(await verifyLicense(token)).toEqual({ ok: false, problem: 'not-configured' })
})

test('activation, reload and removal switch Pro on and off', async () => {
  const store = new Map<string, string>()
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) } })
  try {
    expect((await activateLicense('VERSA1.x.y', publicKey)).ok).toBe(false)
    expect(isPro()).toBe(false)
    expect((await activateLicense(sign('--name', 'Ana'), publicKey)).ok).toBe(true)
    expect(isPro()).toBe(true)
    setPro(false)
    expect((await loadLicense(publicKey))?.ok).toBe(true)
    expect(isPro()).toBe(true)
    removeLicense()
    expect(isPro()).toBe(false)
    expect(await loadLicense(publicKey)).toBeUndefined()
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage
  }
})

test('many files are a Pro-only batch; free stays one file at a time', () => {
  const rotate = recipes.find(recipe => recipe.id === 'pdf-rotate')!
  const merge = recipes.find(recipe => recipe.id === 'pdf-merge')!
  const split = recipes.find(recipe => recipe.id === 'pdf-split')!
  expect(available(rotate, ['pdf'])).toBe(true)
  expect(available(rotate, ['pdf', 'pdf'])).toBe(false)
  expect(needsPro(rotate, ['pdf', 'pdf'])).toBe(true)
  expect(needsPro(rotate, ['pdf'])).toBe(false)
  expect(needsPro(rotate, ['pdf', 'jpg'])).toBe(false)
  expect(available(merge, ['pdf', 'pdf'])).toBe(true)
  expect(needsPro(merge, ['pdf', 'pdf'])).toBe(false)
  setPro(true)
  expect(available(rotate, ['pdf', 'pdf', 'pdf'])).toBe(true)
  expect(needsPro(rotate, ['pdf', 'pdf'])).toBe(false)
  expect(available(rotate, ['pdf', 'jpg'])).toBe(false)
  expect(available(split, ['pdf', 'pdf'])).toBe(false)
})

test('runBatch zips every result, keeps names unique and reports rising progress', async () => {
  const handler: Handler = async ({ files: [file], progress }) => {
    progress(50)
    return { blob: new Blob([file.name]), name: localName(file, 'txt') }
  }
  const files = [new File(['1'], 'a.pdf'), new File(['2'], 'b.pdf'), new File(['3'], 'a.pdf')]
  const seen: number[] = []
  const result = await runBatch(handler, files, {}, value => seen.push(value))
  expect(result.name).toBe('a + 2 (Versa).zip')
  const entries = unzipSync(new Uint8Array(await result.blob.arrayBuffer()))
  expect(Object.keys(entries)).toEqual(['a (Versa).txt', 'b (Versa).txt', 'a (Versa) 2.txt'])
  expect(Object.values(entries).map(bytes => new TextDecoder().decode(bytes))).toEqual(['a.pdf', 'b.pdf', 'a.pdf'])
  expect(seen.at(-1)).toBe(100)
  expect(seen).toEqual([...seen].sort((a, b) => a - b))
})
