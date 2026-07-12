import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const requireFromHere = createRequire(import.meta.url)
const KEYTAR_BINARY_RELATIVE_PATH = path.join('build', 'Release', 'keytar.node')

function fail(message) {
  console.error(`[keytar-smoke] ${message}`)
  process.exit(1)
}

function info(message) {
  console.log(`[keytar-smoke] ${message}`)
}

function resolveSecureStoreApi(moduleNamespace) {
  if (!moduleNamespace || typeof moduleNamespace !== 'object') return null
  const candidate = moduleNamespace
  if (
    typeof candidate.encryptWithPassword === 'function' &&
    typeof candidate.decryptWithPassword === 'function'
  ) {
    return candidate
  }
  return null
}

let secureStorePkgJson
try {
  secureStorePkgJson = requireFromHere.resolve('@aopslab/xf-secure-store/package.json')
} catch (error) {
  fail(`Cannot resolve @aopslab/xf-secure-store/package.json. ${String(error)}`)
}

const requireFromSecureStore = createRequire(secureStorePkgJson)

let keytarPkgJson
try {
  keytarPkgJson = requireFromSecureStore.resolve('keytar/package.json')
} catch (error) {
  fail(`Cannot resolve keytar/package.json from xf-secure-store. ${String(error)}`)
}

const keytarDir = path.dirname(keytarPkgJson)
const keytarBinaryPath = path.join(keytarDir, KEYTAR_BINARY_RELATIVE_PATH)
if (!fs.existsSync(keytarBinaryPath)) {
  fail(`Missing keytar binary: ${keytarBinaryPath}`)
}

let keytarModule
try {
  keytarModule = requireFromSecureStore('keytar')
} catch (error) {
  fail(`Failed to require keytar native module. ${String(error)}`)
}

if (
  typeof keytarModule?.getPassword !== 'function' ||
  typeof keytarModule?.setPassword !== 'function' ||
  typeof keytarModule?.deletePassword !== 'function'
) {
  fail('Loaded keytar module does not expose expected API (getPassword/setPassword/deletePassword).')
}

let secureStoreNamespace
try {
  secureStoreNamespace = requireFromHere('@aopslab/xf-secure-store')
} catch (error) {
  fail(`Failed to require @aopslab/xf-secure-store. ${String(error)}`)
}

const secureStoreApi =
  resolveSecureStoreApi(secureStoreNamespace) ??
  resolveSecureStoreApi(secureStoreNamespace?.default)

if (!secureStoreApi) {
  fail('Invalid @aopslab/xf-secure-store export shape.')
}

const samplePlainText = `keytar-smoke:${Date.now()}`
const samplePassword = 'aops-smoke-password'

let encrypted
try {
  encrypted = await secureStoreApi.encryptWithPassword(samplePlainText, samplePassword)
} catch (error) {
  fail(`encryptWithPassword failed. ${String(error)}`)
}

if (!encrypted || !encrypted.payload) {
  fail('encryptWithPassword returned invalid payload.')
}

let decrypted
try {
  decrypted = await secureStoreApi.decryptWithPassword(encrypted.payload, samplePassword)
} catch (error) {
  fail(`decryptWithPassword failed. ${String(error)}`)
}

if (decrypted !== samplePlainText) {
  fail('decryptWithPassword output mismatch.')
}

info(`keytar binary found: ${keytarBinaryPath}`)
info('secure-store encrypt/decrypt roundtrip passed.')
