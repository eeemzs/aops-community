import { createHash } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'

import { AgentAssetsError, type AgentAssetsErrorCode } from './envelope.js'

declare const __AOPS_AGENT_ASSETS_NATIVE_MANIFEST_SHA256__: string | undefined

const PROTOCOL = 'AOPS_AGENT_ASSETS_FS_V1'
const NATIVE_SURFACE = 'agent-assets-native-fs-v1'
const SHA256 = /^[a-f0-9]{64}$/
const SUPPORTED = new Set([
  'linux:x64',
  'linux:arm64',
  'darwin:x64',
  'darwin:arm64',
  'win32:x64',
])
const WINDOWS_CRASH_INJECTION_POINTS = Object.freeze([
  'authority-history',
  'authority-current',
  'activation-receipt',
  'active-pointer',
  'runtime-binding-receipt',
  'runtime-binding-current',
  'maintenance-receipt',
  'pin',
  'rollback',
  'prune',
])

type NativePlatform = 'linux' | 'darwin' | 'win32'
type NativeArchitecture = 'x64' | 'arm64'

export type AgentAssetsNativeDurability = 'process-crash' | 'power-loss'

type NativeQualificationRefV1 = Readonly<{
  relativePath: string
  sha256: string
}>

type NativeHelperRecordV1 = Readonly<{
  platform: NativePlatform
  architecture: NativeArchitecture
  relativePath: string
  sha256: string
  capabilityClass:
    | 'linux-posix-durable-v1'
    | 'macos-exclusive-durable-v1'
    | 'windows-ntfs-crash-recoverable-v1'
  qualification: NativeQualificationRefV1 | null
}>

type NativeManifestV1 = Readonly<{
  schemaVersion: 1
  surface: typeof NATIVE_SURFACE
  helpers: readonly NativeHelperRecordV1[]
}>

type WindowsQualificationV1 = Readonly<{
  schemaVersion: 1
  status: 'qualified'
  platform: 'win32'
  architecture: NativeArchitecture
  osBuild: string
  filesystem: 'NTFS'
  primitiveProfile: 'windows-createfile-flush-movefileex-v1'
  capabilityClass: 'windows-ntfs-crash-recoverable-v1'
  evidenceSha256: string
  crashInjectionPoints: readonly string[]
}>

export type AgentAssetsNativeCapabilityV1 = Readonly<{
  platform: NativePlatform
  architecture: NativeArchitecture
  filesystem: string
  volumeIdentity: string
  capabilityClass: NativeHelperRecordV1['capabilityClass']
  capabilityEvidenceSha256: string
  machineIdentitySha256: string
  rootIdentitySha256: string
  helperSha256: string
  nativeManifestSha256: string
}>

export type OpenAgentAssetsNativeSessionOptions = Readonly<{
  agentAssetsRoot: string
  bootstrapAnchor?: string
  nativeRoot?: string
  expectedNativeManifestSha256?: string
  requiredDurability?: AgentAssetsNativeDurability
  platform?: NodeJS.Platform
  architecture?: string
}>

export interface AgentAssetsNativePublicationSession {
  readonly capability: AgentAssetsNativeCapabilityV1
  createDirectory(relativePath: string): Promise<void>
  publishFileNoReplace(relativePath: string, content: Uint8Array): Promise<void>
  publishFileReplace(
    relativePath: string,
    expectedPriorSha256: string,
    content: Uint8Array,
  ): Promise<void>
  promoteDirectoryNoReplace(sourceRelativePath: string, destinationRelativePath: string): Promise<void>
  registerRuntimeRoot(runtimeRoot: string): Promise<AgentAssetsNativeRuntimeRoot>
  removeManagedTree(relativePath: string): Promise<'removed' | 'not-found'>
  close(): Promise<void>
}

export interface AgentAssetsNativeRuntimeRoot {
  readonly id: string
  readonly rootIdentitySha256: string
  createDirectory(relativePath: string): Promise<void>
  publishFileNoReplace(relativePath: string, content: Uint8Array): Promise<void>
  publishFileReplace(
    relativePath: string,
    expectedPriorSha256: string,
    content: Uint8Array,
  ): Promise<void>
}

export function windowsQualificationSupportsRuntime(input: Readonly<{
  qualificationArchitecture: string
  qualificationCapabilityClass: string
  runtimeArchitecture: string
  runtimeCapabilityClass: string
}>): boolean {
  return input.qualificationArchitecture === input.runtimeArchitecture
    && input.qualificationCapabilityClass === input.runtimeCapabilityClass
}

export async function openAgentAssetsNativePublicationSession(
  options: OpenAgentAssetsNativeSessionOptions,
): Promise<AgentAssetsNativePublicationSession> {
  const loaded = await loadNativeHelper(options)
  const transport = new NativeTransport(loaded.helperPath)
  try {
    await transport.ready
    const bootstrapAnchor = await resolveBootstrapAnchor(options)
    const bootstrap = await transport.command([
      PROTOCOL,
      'bootstrap',
      hexUtf8(bootstrapAnchor),
      hexUtf8(path.resolve(options.agentAssetsRoot)),
    ])
    if (bootstrap.length !== 1 || bootstrap[0] !== 'bootstrap') {
      throw protocolError('Native helper returned an invalid bootstrap response.')
    }
    const response = await transport.command([
      PROTOCOL,
      'open',
      hexUtf8(options.agentAssetsRoot),
      hexUtf8(loaded.helper.capabilityClass),
      loaded.capabilityEvidenceSha256,
      hexUtf8(loaded.runtimeOsBuild),
      hexUtf8(loaded.helper.architecture),
      options.requiredDurability ?? 'process-crash',
    ])
    if (response[0] !== 'open' || response.length !== 9) {
      throw protocolError('Native helper returned an invalid open response.')
    }
    const capability = Object.freeze({
      platform: response[1] as NativePlatform,
      architecture: response[2] as NativeArchitecture,
      filesystem: decodeHexUtf8(response[3]!),
      volumeIdentity: decodeHexUtf8(response[4]!),
      capabilityClass: decodeHexUtf8(response[5]!) as NativeHelperRecordV1['capabilityClass'],
      capabilityEvidenceSha256: response[6]!,
      machineIdentitySha256: response[7]!,
      rootIdentitySha256: response[8]!,
      helperSha256: loaded.helper.sha256,
      nativeManifestSha256: loaded.manifestSha256,
    })
    assertCapability(capability, loaded)
    return new NativePublicationSession(transport, capability)
  } catch (error) {
    transport.terminate()
    throw normalizeNativeFailure(error)
  }
}

class NativePublicationSession implements AgentAssetsNativePublicationSession {
  readonly capability: AgentAssetsNativeCapabilityV1
  private readonly transport: NativeTransport
  private closed = false

  constructor(transport: NativeTransport, capability: AgentAssetsNativeCapabilityV1) {
    this.transport = transport
    this.capability = capability
  }

  async createDirectory(relativePath: string): Promise<void> {
    await this.run(['mkdir', hexUtf8(relativePath)])
  }

  async publishFileNoReplace(relativePath: string, content: Uint8Array): Promise<void> {
    await this.run(['publish-no-replace', hexUtf8(relativePath), Buffer.from(content).toString('hex')])
  }

  async publishFileReplace(
    relativePath: string,
    expectedPriorSha256: string,
    content: Uint8Array,
  ): Promise<void> {
    if (!SHA256.test(expectedPriorSha256)) {
      throw protocolError('Expected prior digest must be lowercase SHA-256.')
    }
    await this.run([
      'publish-replace',
      hexUtf8(relativePath),
      expectedPriorSha256,
      Buffer.from(content).toString('hex'),
    ])
  }

  async promoteDirectoryNoReplace(
    sourceRelativePath: string,
    destinationRelativePath: string,
  ): Promise<void> {
    await this.run([
      'promote-directory',
      hexUtf8(sourceRelativePath),
      hexUtf8(destinationRelativePath),
    ])
  }

  async registerRuntimeRoot(runtimeRoot: string): Promise<AgentAssetsNativeRuntimeRoot> {
    if (this.closed) throw protocolError('Native publication session is closed.')
    const response = await this.transport.command([
      PROTOCOL,
      'register-runtime-root',
      hexUtf8(path.resolve(runtimeRoot)),
    ])
    if (
      response.length !== 3
      || response[0] !== 'register-runtime-root'
      || !/^runtime-[1-9]\d*$/.test(response[1]!)
      || !SHA256.test(response[2]!)
    ) {
      throw protocolError('Native helper returned an invalid runtime-root registration.')
    }
    return new NativeRuntimeRoot(response[1]!, response[2]!, (fields) => this.run(fields))
  }

  async removeManagedTree(relativePath: string): Promise<'removed' | 'not-found'> {
    if (this.closed) throw protocolError('Native publication session is closed.')
    const response = await this.transport.command([
      PROTOCOL,
      'remove-managed-tree',
      hexUtf8(relativePath),
    ])
    if (
      response.length !== 2
      || response[0] !== 'remove-managed-tree'
      || (response[1] !== 'removed' && response[1] !== 'not-found')
    ) {
      throw protocolError('Native helper returned an invalid managed-removal response.')
    }
    return response[1]
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      await this.transport.command([PROTOCOL, 'close'])
    } finally {
      this.transport.terminate()
    }
  }

  private async run(fields: readonly string[]): Promise<void> {
    if (this.closed) throw protocolError('Native publication session is closed.')
    const response = await this.transport.command([PROTOCOL, ...fields])
    if (response[0] !== fields[0] || response.length !== 1) {
      throw protocolError('Native helper returned an invalid mutation response.')
    }
  }
}

async function resolveBootstrapAnchor(options: OpenAgentAssetsNativeSessionOptions): Promise<string> {
  const root = path.resolve(options.agentAssetsRoot)
  if (options.bootstrapAnchor) return path.resolve(options.bootstrapAnchor)
  const home = path.resolve(os.homedir())
  const relativeToHome = path.relative(home, root)
  if (relativeToHome && !relativeToHome.startsWith('..') && !path.isAbsolute(relativeToHome)) {
    return home
  }
  const rootStats = await lstat(root).catch(() => null)
  if (rootStats?.isDirectory() && !rootStats.isSymbolicLink()) return root
  throw new AgentAssetsError(
    'atomic_primitive_unavailable',
    'A missing agent-assets root outside the user home requires an explicit trusted bootstrap anchor.',
    { nextActions: ['Pass bootstrapAnchor as an existing canonical local directory containing agentAssetsRoot.'] },
  )
}

class NativeRuntimeRoot implements AgentAssetsNativeRuntimeRoot {
  constructor(
    readonly id: string,
    readonly rootIdentitySha256: string,
    private readonly run: (fields: readonly string[]) => Promise<void>,
  ) {}

  async createDirectory(relativePath: string): Promise<void> {
    await this.run(['runtime-mkdir', this.id, hexUtf8(relativePath)])
  }

  async publishFileNoReplace(relativePath: string, content: Uint8Array): Promise<void> {
    await this.run([
      'runtime-publish-no-replace',
      this.id,
      hexUtf8(relativePath),
      Buffer.from(content).toString('hex'),
    ])
  }

  async publishFileReplace(
    relativePath: string,
    expectedPriorSha256: string,
    content: Uint8Array,
  ): Promise<void> {
    if (!SHA256.test(expectedPriorSha256)) {
      throw protocolError('Expected runtime prior digest must be lowercase SHA-256.')
    }
    await this.run([
      'runtime-publish-replace',
      this.id,
      hexUtf8(relativePath),
      expectedPriorSha256,
      Buffer.from(content).toString('hex'),
    ])
  }
}

class NativeTransport {
  readonly ready: Promise<void>
  private readonly child: ChildProcessWithoutNullStreams
  private readonly readline: ReadlineInterface
  private readonly pending: Array<{
    resolve: (fields: string[]) => void
    reject: (error: Error) => void
  }> = []
  private readyResolve!: () => void
  private readyReject!: (error: Error) => void
  private didReadReady = false
  private closed = false

  constructor(helperPath: string) {
    this.child = spawn(helperPath, ['session'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    this.readline = createInterface({ input: this.child.stdout, crlfDelay: Infinity })
    this.readline.on('line', (line) => this.onLine(line))
    this.child.once('error', (error) => this.failAll(error))
    this.child.once('exit', (code, signal) => {
      this.failAll(new Error(`native helper exited before close (${code ?? signal ?? 'unknown'})`))
    })
  }

  command(fields: readonly string[]): Promise<string[]> {
    if (this.closed) return Promise.reject(protocolError('Native helper transport is closed.'))
    return new Promise<string[]>((resolve, reject) => {
      this.pending.push({ resolve, reject })
      this.child.stdin.write(`${fields.join('\t')}\n`, 'utf8', (error) => {
        if (error) this.failAll(error)
      })
    })
  }

  terminate(): void {
    if (this.closed) return
    this.closed = true
    this.readline.close()
    this.child.stdin.destroy()
    this.child.kill()
  }

  private onLine(line: string): void {
    const fields = line.split('\t')
    if (!this.didReadReady) {
      this.didReadReady = true
      if (
        fields.length === 5
        && fields[0] === 'READY'
        && fields[1] === PROTOCOL
        && fields[2] === '1'
      ) {
        this.readyResolve()
      } else {
        this.readyReject(protocolError('Native helper handshake is incompatible.'))
      }
      return
    }
    const pending = this.pending.shift()
    if (!pending) {
      this.failAll(protocolError('Native helper emitted an unsolicited response.'))
      return
    }
    if (fields[0] === 'OK') {
      pending.resolve(fields.slice(1))
      return
    }
    if (fields[0] === 'ERR' && fields.length === 3) {
      pending.reject(nativeError(fields[1]!, decodeHexUtf8(fields[2]!)))
      return
    }
    pending.reject(protocolError('Native helper response is malformed.'))
  }

  private failAll(error: Error): void {
    if (!this.didReadReady) this.readyReject(error)
    for (const pending of this.pending.splice(0)) pending.reject(error)
    this.terminate()
  }
}

async function loadNativeHelper(options: OpenAgentAssetsNativeSessionOptions): Promise<Readonly<{
  helper: NativeHelperRecordV1
  helperPath: string
  manifestSha256: string
  capabilityEvidenceSha256: string
  runtimeOsBuild: string
}>> {
  const platform = normalizePlatform(options.platform ?? process.platform)
  const architecture = normalizeArchitecture(options.architecture ?? process.arch)
  if (!SUPPORTED.has(`${platform}:${architecture}`)) {
    throw new AgentAssetsError(
      'atomic_primitive_unavailable',
      `No v1 native publication helper is supported for ${platform}/${architecture}.`,
      { nextActions: ['Use a supported Community CLI platform build; do not enable a JavaScript filesystem fallback.'] },
    )
  }
  const nativeRoot = path.resolve(options.nativeRoot ?? defaultNativeRoot())
  await assertPlainPath(nativeRoot, true)
  const manifestPath = path.join(nativeRoot, 'manifest.json')
  const manifestBytes = await readPlainFile(manifestPath)
  const manifestSha256 = sha256(manifestBytes)
  const expectedManifestSha256 = options.expectedNativeManifestSha256
    ?? injectedNativeManifestSha256()
  if (!expectedManifestSha256 || !SHA256.test(expectedManifestSha256)) {
    throw new AgentAssetsError(
      'atomic_primitive_unavailable',
      'The installed CLI has no signed native-helper manifest identity.',
      { nextActions: ['Reinstall AOPS CLI from a signed Community release.'] },
    )
  }
  if (manifestSha256 !== expectedManifestSha256) {
    throw new AgentAssetsError('hash_mismatch', 'The native-helper manifest digest does not match the CLI identity.', {
      nextActions: ['Reinstall AOPS CLI from the same signed Community release; do not repair helper files manually.'],
    })
  }
  const manifest = parseNativeManifest(manifestBytes)
  const helper = manifest.helpers.find((item) => (
    item.platform === platform && item.architecture === architecture
  ))
  if (!helper) {
    throw new AgentAssetsError(
      'atomic_primitive_unavailable',
      `The signed CLI archive does not contain a helper for ${platform}/${architecture}.`,
      { nextActions: ['Install a Community CLI archive that includes this exact platform helper.'] },
    )
  }
  const helperPath = safeManifestPath(nativeRoot, helper.relativePath)
  const helperBytes = await readPlainFile(helperPath)
  if (sha256(helperBytes) !== helper.sha256) {
    throw new AgentAssetsError('hash_mismatch', 'The packaged native helper digest is invalid.', {
      nextActions: ['Reinstall the signed Community CLI package.'],
    })
  }

  if (platform !== 'win32') {
    if (helper.qualification !== null) {
      throw protocolError('POSIX helper records must not carry a Windows qualification.')
    }
    return Object.freeze({
      helper,
      helperPath,
      manifestSha256,
      capabilityEvidenceSha256: helper.sha256,
      runtimeOsBuild: '',
    })
  }

  if (!helper.qualification) {
    throw new AgentAssetsError(
      'durability_unavailable',
      'The Windows helper has no packaged signed crash-recovery qualification.',
      { nextActions: ['Install a Community release with signed Windows crash-recovery evidence.'] },
    )
  }
  const qualificationPath = safeManifestPath(nativeRoot, helper.qualification.relativePath)
  const qualificationBytes = await readPlainFile(qualificationPath)
  if (sha256(qualificationBytes) !== helper.qualification.sha256) {
    throw new AgentAssetsError('hash_mismatch', 'The Windows qualification digest is invalid.', {
      nextActions: ['Reinstall the signed Community CLI package.'],
    })
  }
  const qualification = parseWindowsQualification(qualificationBytes)
  if (!windowsQualificationSupportsRuntime({
    qualificationArchitecture: qualification.architecture,
    qualificationCapabilityClass: qualification.capabilityClass,
    runtimeArchitecture: architecture,
    runtimeCapabilityClass: helper.capabilityClass,
  })) {
    throw new AgentAssetsError(
      'durability_unavailable',
      'The packaged Windows qualification does not match this architecture and capability class.',
      { nextActions: ['Install a Community release with a compatible signed Windows helper.'] },
    )
  }
  // The evidence build identifies where crash recovery was exercised; it is
  // provenance metadata, not a Windows Update allowlist. Runtime compatibility
  // is enforced by the signed helper identity and the live kernel/NTFS probe.
  return Object.freeze({
    helper,
    helperPath,
    manifestSha256,
    capabilityEvidenceSha256: qualification.evidenceSha256,
    runtimeOsBuild: os.release(),
  })
}

function parseNativeManifest(bytes: Uint8Array): NativeManifestV1 {
  const value = parseJson(bytes, 'Native helper manifest is not valid JSON.')
  exactKeys(value, ['schemaVersion', 'surface', 'helpers'])
  if (value.schemaVersion !== 1 || value.surface !== NATIVE_SURFACE || !Array.isArray(value.helpers)) {
    throw protocolError('Native helper manifest schema is incompatible.')
  }
  const identities = new Set<string>()
  const paths = new Set<string>()
  const helpers = value.helpers.map((raw): NativeHelperRecordV1 => {
    exactKeys(raw, [
      'platform',
      'architecture',
      'relativePath',
      'sha256',
      'capabilityClass',
      'qualification',
    ])
    const platform = normalizePlatform(raw.platform)
    const architecture = normalizeArchitecture(raw.architecture)
    const identity = `${platform}:${architecture}`
    if (identities.has(identity)) throw protocolError('Native helper manifest has a duplicate platform identity.')
    identities.add(identity)
    assertManifestRelativePath(raw.relativePath)
    if (paths.has(raw.relativePath)) throw protocolError('Native helper manifest has a duplicate path.')
    paths.add(raw.relativePath)
    if (!SHA256.test(raw.sha256)) throw protocolError('Native helper digest is invalid.')
    const expectedClass = platform === 'win32'
      ? 'windows-ntfs-crash-recoverable-v1'
      : platform === 'darwin'
        ? 'macos-exclusive-durable-v1'
        : 'linux-posix-durable-v1'
    if (raw.capabilityClass !== expectedClass) throw protocolError('Native helper capability class is invalid.')
    let qualification: NativeQualificationRefV1 | null = null
    if (raw.qualification !== null) {
      exactKeys(raw.qualification, ['relativePath', 'sha256'])
      assertManifestRelativePath(raw.qualification.relativePath)
      if (!SHA256.test(raw.qualification.sha256) || paths.has(raw.qualification.relativePath)) {
        throw protocolError('Native qualification record is invalid or duplicated.')
      }
      paths.add(raw.qualification.relativePath)
      qualification = Object.freeze({
        relativePath: raw.qualification.relativePath,
        sha256: raw.qualification.sha256,
      })
    }
    return Object.freeze({
      platform,
      architecture,
      relativePath: raw.relativePath,
      sha256: raw.sha256,
      capabilityClass: expectedClass,
      qualification,
    })
  })
  if (helpers.length === 0) throw protocolError('Native helper manifest is empty.')
  return Object.freeze({ schemaVersion: 1, surface: NATIVE_SURFACE, helpers: Object.freeze(helpers) })
}

function parseWindowsQualification(bytes: Uint8Array): WindowsQualificationV1 {
  const value = parseJson(bytes, 'Windows qualification is not valid JSON.')
  exactKeys(value, [
    'schemaVersion',
    'status',
    'platform',
    'architecture',
    'osBuild',
    'filesystem',
    'primitiveProfile',
    'capabilityClass',
    'evidenceSha256',
    'crashInjectionPoints',
  ])
  if (
    value.schemaVersion !== 1
    || value.status !== 'qualified'
    || value.platform !== 'win32'
    || !['x64', 'arm64'].includes(value.architecture)
    || !/^\d+\.\d+\.\d+$/.test(value.osBuild)
    || value.filesystem !== 'NTFS'
    || value.primitiveProfile !== 'windows-createfile-flush-movefileex-v1'
    || value.capabilityClass !== 'windows-ntfs-crash-recoverable-v1'
    || !SHA256.test(value.evidenceSha256)
    || JSON.stringify(value.crashInjectionPoints) !== JSON.stringify(WINDOWS_CRASH_INJECTION_POINTS)
  ) {
    throw new AgentAssetsError('durability_unavailable', 'Windows qualification is incomplete or incompatible.', {
      nextActions: ['Install a Community release with complete crash-injection evidence.'],
    })
  }
  return Object.freeze(value as WindowsQualificationV1)
}

function assertCapability(
  capability: AgentAssetsNativeCapabilityV1,
  loaded: Awaited<ReturnType<typeof loadNativeHelper>>,
): void {
  if (
    capability.platform !== loaded.helper.platform
    || capability.architecture !== loaded.helper.architecture
    || capability.capabilityClass !== loaded.helper.capabilityClass
    || capability.capabilityEvidenceSha256 !== loaded.capabilityEvidenceSha256
    || (loaded.helper.platform === 'win32' && capability.filesystem !== 'NTFS')
    || !SHA256.test(capability.machineIdentitySha256)
    || !SHA256.test(capability.rootIdentitySha256)
    || capability.machineIdentitySha256 === capability.rootIdentitySha256
    || capability.machineIdentitySha256 === capability.capabilityEvidenceSha256
    || capability.rootIdentitySha256 === capability.capabilityEvidenceSha256
  ) {
    throw new AgentAssetsError(
      'atomic_primitive_unavailable',
      'Native live-probe identity does not match the signed helper manifest.',
      { nextActions: ['Reinstall the signed Community CLI archive and rerun readiness.'] },
    )
  }
}

async function assertPlainPath(candidate: string, directory: boolean): Promise<void> {
  const resolved = path.resolve(candidate)
  const physical = await realpath(resolved).catch(() => null)
  const stats = await lstat(resolved).catch(() => null)
  if (
    !physical
    || physical !== resolved
    || !stats
    || stats.isSymbolicLink()
    || (directory ? !stats.isDirectory() : !stats.isFile())
  ) {
    throw new AgentAssetsError('link_unsafe_path', 'Native helper package path is linked or not a plain entry.', {
      nextActions: ['Reinstall the CLI into a real non-linked package directory.'],
    })
  }
}

async function readPlainFile(candidate: string): Promise<Buffer> {
  await assertPlainPath(candidate, false)
  return readFile(candidate)
}

function safeManifestPath(root: string, relativePath: string): string {
  assertManifestRelativePath(relativePath)
  const candidate = path.resolve(root, ...relativePath.split('/'))
  const relative = path.relative(root, candidate)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw protocolError('Native manifest path escaped its package root.')
  }
  return candidate
}

function assertManifestRelativePath(value: unknown): asserts value is string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw protocolError('Native manifest contains an unsafe relative path.')
  }
}

function exactKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw protocolError('Record shape is invalid.')
  const actual = Object.keys(value)
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw protocolError('Record contains missing or unknown fields.')
  }
}

function parseJson(bytes: Uint8Array, message: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch {
    throw protocolError(message)
  }
}

function normalizePlatform(value: unknown): NativePlatform {
  if (value === 'linux' || value === 'darwin' || value === 'win32') return value
  throw new AgentAssetsError('atomic_primitive_unavailable', `Unsupported native platform: ${String(value)}`, {
    nextActions: ['Use a supported Community CLI platform build.'],
  })
}

function normalizeArchitecture(value: unknown): NativeArchitecture {
  if (value === 'x64' || value === 'arm64') return value
  throw new AgentAssetsError('atomic_primitive_unavailable', `Unsupported native architecture: ${String(value)}`, {
    nextActions: ['Use a supported Community CLI architecture build.'],
  })
}

function defaultNativeRoot(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
  const bundled = path.resolve(moduleDirectory, '..', 'native')
  const compiledOrSource = path.resolve(moduleDirectory, '..', '..', '..', 'native')
  return moduleDirectory.endsWith(`${path.sep}dist`) ? bundled : compiledOrSource
}

function injectedNativeManifestSha256(): string | undefined {
  return typeof __AOPS_AGENT_ASSETS_NATIVE_MANIFEST_SHA256__ === 'undefined'
    ? undefined
    : __AOPS_AGENT_ASSETS_NATIVE_MANIFEST_SHA256__
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function hexUtf8(value: string): string {
  return Buffer.from(value, 'utf8').toString('hex')
}

function decodeHexUtf8(value: string): string {
  if (value.length % 2 !== 0 || !/^[a-f0-9]*$/.test(value)) throw protocolError('Native response hex is invalid.')
  return Buffer.from(value, 'hex').toString('utf8')
}

function protocolError(message: string): AgentAssetsError {
  return new AgentAssetsError('atomic_primitive_unavailable', message, {
    nextActions: ['Reinstall the signed Community CLI package; do not enable a JavaScript fallback.'],
  })
}

function nativeError(code: string, message: string): AgentAssetsError {
  const allowed: AgentAssetsErrorCode[] = [
    'invalid_package_path',
    'link_unsafe_path',
    'concurrent_writer',
    'publication_conflict',
    'atomic_replace_blocked',
    'atomic_primitive_unavailable',
    'durability_unavailable',
    'different_machine_store',
    'schema_incompatible',
  ]
  const normalized = allowed.includes(code as AgentAssetsErrorCode)
    ? code as AgentAssetsErrorCode
    : 'atomic_primitive_unavailable'
  return new AgentAssetsError(normalized, message, {
    nextActions: ['Run `aops assets status --verify full --json` and inspect native capability diagnostics.'],
  })
}

function normalizeNativeFailure(error: unknown): AgentAssetsError {
  return error instanceof AgentAssetsError
    ? error
    : protocolError(error instanceof Error ? error.message : String(error))
}
