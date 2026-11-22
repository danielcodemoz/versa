#!/usr/bin/env node
// Versa Pro licence tool. Run it on YOUR computer; the private key never goes in the repository.
//   node tools/licence.mjs keygen <folder-outside-the-repo>
//   node tools/licence.mjs sign <private-key-file> --name "Escola X" [--until 2027-12-31]
import { generateKeyPairSync, createSign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const [command, target, ...rest] = process.argv.slice(2)
const b64 = value => Buffer.from(value).toString('base64url')
const fail = message => { console.error(message); process.exit(1) }

if (command === 'keygen') {
  if (!target) fail('Uso: node tools/licence.mjs keygen <pasta fora do repositório>')
  const folder = resolve(target)
  if (!relative(process.cwd(), folder).startsWith('..')) fail('Escolhe uma pasta FORA do repositório (a chave privada nunca vai para o git).')
  const file = join(folder, 'versa-licence-private.json')
  if (existsSync(file)) fail(`Já existe ${file}. Não o substituo: perderias as chaves emitidas.`)
  mkdirSync(folder, { recursive: true })
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  writeFileSync(file, JSON.stringify(privateKey.export({ format: 'jwk' })), { mode: 0o600 })
  console.log(`Chave privada guardada em ${file} (faz cópia de segurança; sem ela não emites mais chaves).`)
  console.log('Cola isto em packages/engine/license.ts, em `publicKey`:\n')
  console.log(JSON.stringify(publicKey.export({ format: 'jwk' })))
} else if (command === 'sign') {
  if (!target) fail('Uso: node tools/licence.mjs sign <ficheiro-da-chave-privada> --name "Nome" [--until AAAA-MM-DD]')
  const option = name => { const index = rest.indexOf(name); return index >= 0 ? rest[index + 1] : undefined }
  const name = option('--name')
  const until = option('--until')
  if (!name) fail('Falta --name.')
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) fail('--until tem de ser AAAA-MM-DD.')
  const jwk = JSON.parse(readFileSync(target, 'utf8'))
  const { createPrivateKey } = await import('node:crypto')
  const body = b64(JSON.stringify({ n: name, p: 'pro', ...(until ? { e: until } : {}) }))
  const signature = createSign('SHA256').update(`VERSA1.${body}`).sign({ key: createPrivateKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' })
  console.log(`VERSA1.${body}.${signature.toString('base64url')}`)
} else fail('Comandos: keygen | sign')
