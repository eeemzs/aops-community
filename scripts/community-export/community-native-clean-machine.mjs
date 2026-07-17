#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const POSTGRES_URL_ENV = 'AOPS_CLEAN_MACHINE_POSTGRES_URL';
const DEFAULT_PORT = 5910;
const MAX_POSTGRES_URL_BYTES = 4_096;
const INSTANCE_NAME = 'clean-machine-n1';
const HTTP_FETCH_ATTEMPTS = 3;
const HTTP_FETCH_RETRY_DELAY_MS = 250;

function fail(code, detail) {
  throw new Error(detail === undefined ? code : `${code}:${detail}`);
}

function isLoopbackHost(value) {
  const host = String(value).replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  const match = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return Boolean(match && match.slice(1).every((octet) => Number(octet) <= 255));
}

function inspectPostgresUrl(env) {
  const raw = String(env?.[POSTGRES_URL_ENV] ?? '');
  if (
    !raw || raw.trim() !== raw || Buffer.byteLength(raw, 'utf8') > MAX_POSTGRES_URL_BYTES ||
    /[\r\n\0]/.test(raw)
  ) fail('community_native_clean_machine_postgres_url_invalid');
  let parsed;
  try { parsed = new URL(raw); } catch { fail('community_native_clean_machine_postgres_url_invalid'); }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) || !isLoopbackHost(parsed.hostname) ||
    !parsed.username || !parsed.password || parsed.password.length < 8 || !parsed.pathname.slice(1) ||
    parsed.search || parsed.hash
  ) fail('community_native_clean_machine_postgres_url_invalid');
  let password;
  try { password = decodeURIComponent(parsed.password); } catch {
    fail('community_native_clean_machine_postgres_url_invalid');
  }
  if (password.length < 8) fail('community_native_clean_machine_postgres_url_invalid');
  return { raw, password };
}

function sanitizedChildEnv(env) {
  const output = { ...env };
  for (const key of Object.keys(output)) {
    const upper = key.toUpperCase();
    if (
      upper === POSTGRES_URL_ENV || /^PG[A-Z0-9_]*$/.test(upper) || /^AOPS_PG_/.test(upper) ||
      ['DATABASE_URL', 'POSTGRES_URL', 'DEV_PG_URL'].includes(upper)
    ) delete output[key];
  }
  return output;
}

export function redactCommunityNativeCleanMachine(value, secrets = []) {
  const urlMarker = '\u0000AOPS_CONNECTION_URL_REDACTED\u0000';
  let output = String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, urlMarker)
    .replace(/(?:password|pwd)\s*[=:]\s*[^\s;"']+/gi, 'password=[REDACTED]');
  for (const secret of [...new Set(secrets.map(String).filter((entry) => entry.length >= 3))]
    .sort((left, right) => right.length - left.length)) {
    output = output.split(secret).join('[REDACTED]');
  }
  return output.split(urlMarker).join('postgresql://[REDACTED]');
}

function assertNoSecretLeak(value, secrets, label) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (secrets.some((secret) => secret && serialized.includes(secret))) {
    fail('community_native_clean_machine_secret_leak', label);
  }
}

function requireAbsoluteDirectory(value, code) {
  if (!value || !path.isAbsolute(value)) fail(`${code}_absolute_required`);
  const resolved = path.resolve(value);
  let stats;
  try { stats = lstatSync(resolved); } catch { fail(`${code}_missing`); }
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail(`${code}_invalid`);
  return resolved;
}

function requireCliEntry(checkoutRoot) {
  const cliEntry = path.join(checkoutRoot, 'apps', 'aops-cli', 'dist', 'main.js');
  let stats;
  try { stats = lstatSync(cliEntry); } catch { fail('community_native_clean_machine_cli_missing'); }
  if (!stats.isFile() || stats.isSymbolicLink()) fail('community_native_clean_machine_cli_invalid');
  return cliEntry;
}

function prepareCredentialFile(dataRoot, postgresUrl) {
  if (!path.isAbsolute(dataRoot)) fail('community_native_clean_machine_data_root_absolute_required');
  const resolved = path.resolve(dataRoot);
  try {
    mkdirSync(resolved, { recursive: false, mode: 0o700 });
  } catch (error) {
    fail('community_native_clean_machine_data_root_not_fresh', error?.code ?? 'mkdir_failed');
  }
  const rootStats = lstatSync(resolved);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    fail('community_native_clean_machine_data_root_invalid');
  }
  const configPath = path.join(resolved, 'postgres.env');
  try {
    writeFileSync(configPath, `AOPS_PG_URL=${postgresUrl}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    if (process.platform !== 'win32') {
      chmodSync(configPath, 0o600);
      if ((statSync(configPath).mode & 0o777) !== 0o600) {
        fail('community_native_clean_machine_postgres_config_permissions_invalid');
      }
    }
    const configStats = lstatSync(configPath);
    if (!configStats.isFile() || configStats.isSymbolicLink()) {
      fail('community_native_clean_machine_postgres_config_invalid');
    }
    return configPath;
  } catch (error) {
    rmSync(configPath, { force: true });
    throw error;
  }
}

export function parseCommunityNativeCliJson(value) {
  const output = String(value ?? '').trim();
  for (let index = output.lastIndexOf('{'); index >= 0; index = output.lastIndexOf('{', index - 1)) {
    if (index > 0 && output[index - 1] !== '\n' && output[index - 1] !== '\r') continue;
    try { return JSON.parse(output.slice(index)); } catch { /* scan the previous line-start object */ }
  }
  fail('community_native_clean_machine_cli_json_invalid');
}

function defaultRunCli({ cliEntry, checkoutRoot, args, env, secrets }) {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: checkoutRoot,
    env,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  assertNoSecretLeak(`${stdout}\n${stderr}`, secrets, args.slice(0, 2).join('-'));
  if (result.error || result.status !== 0) {
    const detail = redactCommunityNativeCleanMachine(
      `${result.error?.message ?? ''}\n${stdout}\n${stderr}`.trim().slice(-4_000),
      secrets,
    );
    fail('community_native_clean_machine_cli_failed', `${args.slice(0, 2).join('-')}:${result.status}:${detail}`);
  }
  try { return parseCommunityNativeCliJson(stdout); } catch {
    fail('community_native_clean_machine_cli_json_invalid', args.slice(0, 2).join('-'));
  }
}

function assertRunningStatus(status) {
  if (
    status?.status !== 'installed' || status.runtime !== 'native' || status.runtimeState !== 'running' ||
    status.liveness?.supervisor !== true || status.liveness?.host !== true ||
    status.liveness?.health !== 'healthy' || status.liveness?.identityBound !== true
  ) fail('community_native_clean_machine_running_status_invalid');
}

export async function verifyCommunityNativeHttpSurface(
  origin,
  fetchImpl,
  sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
) {
  const expectedOrigin = new URL(origin);
  if (expectedOrigin.protocol !== 'http:' || expectedOrigin.hostname !== '127.0.0.1') {
    fail('community_native_clean_machine_origin_invalid');
  }
  const request = async (pathname) => {
    for (let attempt = 1; attempt <= HTTP_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchImpl(new URL(pathname, expectedOrigin), {
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        });
        if (!response?.ok) {
          fail('community_native_clean_machine_http_failed', `${pathname}:${response?.status ?? 'unknown'}`);
        }
        return response;
      } catch (error) {
        if (String(error?.message ?? '').startsWith('community_native_clean_machine_http_failed:')) throw error;
        if (attempt < HTTP_FETCH_ATTEMPTS) {
          await sleepImpl(HTTP_FETCH_RETRY_DELAY_MS);
          continue;
        }
        const reason = String(error?.cause?.code ?? error?.code ?? error?.name ?? 'unknown')
          .replace(/[^A-Za-z0-9_-]/g, '') || 'unknown';
        fail('community_native_clean_machine_fetch_failed', `${pathname}:${reason}`);
      }
    }
    fail('community_native_clean_machine_fetch_failed', `${pathname}:unknown`);
  };
  const health = await request('/api/health');
  const healthText = await health.text();
  if (!healthText.trim()) fail('community_native_clean_machine_health_empty');
  const cockpit = await request('/');
  const contentType = String(cockpit.headers?.get?.('content-type') ?? '');
  const html = await cockpit.text();
  if (!contentType.toLowerCase().includes('text/html') || !/(?:<!doctype html|<html)/i.test(html)) {
    fail('community_native_clean_machine_cockpit_invalid');
  }
  return { healthStatus: health.status, cockpitStatus: cockpit.status };
}

function defaultDataRoot(env) {
  const runnerTemp = requireAbsoluteDirectory(env?.RUNNER_TEMP, 'community_native_clean_machine_runner_temp');
  const runId = String(env?.GITHUB_RUN_ID ?? 'local').replace(/[^A-Za-z0-9_-]/g, '');
  const attempt = String(env?.GITHUB_RUN_ATTEMPT ?? '1').replace(/[^A-Za-z0-9_-]/g, '');
  if (!runId || !attempt) fail('community_native_clean_machine_run_identity_invalid');
  return path.join(runnerTemp, `aops-community-native-${runId}-${attempt}`);
}

export async function proveCommunityNativeCleanMachine({
  checkoutRoot = process.cwd(),
  dataRoot,
  port = DEFAULT_PORT,
  env = process.env,
  runCli = defaultRunCli,
  fetchImpl = globalThis.fetch,
} = {}) {
  const checkout = requireAbsoluteDirectory(path.resolve(checkoutRoot), 'community_native_clean_machine_checkout');
  const cliEntry = requireCliEntry(checkout);
  const selectedPort = Number(port);
  if (!Number.isSafeInteger(selectedPort) || selectedPort < 1024 || selectedPort > 65_535) {
    fail('community_native_clean_machine_port_invalid');
  }
  if (typeof fetchImpl !== 'function') fail('community_native_clean_machine_fetch_required');
  const postgres = inspectPostgresUrl(env);
  const secrets = [postgres.raw, postgres.password];
  const cleanEnv = sanitizedChildEnv(env);
  const selectedDataRoot = path.resolve(dataRoot ?? defaultDataRoot(env));
  const configPath = prepareCredentialFile(selectedDataRoot, postgres.raw);
  const common = ['--instance', INSTANCE_NAME, '--data-root', selectedDataRoot, '--json'];
  const invoke = async (args) => {
    try {
      const result = await runCli({ cliEntry, checkoutRoot: checkout, args, env: cleanEnv, secrets });
      assertNoSecretLeak(result, secrets, args.slice(0, 2).join('-'));
      return result;
    } catch (error) {
      throw new Error(redactCommunityNativeCleanMachine(error?.message ?? error, secrets));
    }
  };
  let cleanupRequired = false;
  try {
    cleanupRequired = true;
    const setup = await invoke([
      'server', 'setup', '--runtime', 'native', '--postgres', 'external',
      '--postgres-config', configPath, '--postgres-tls', 'disable',
      '--source-root', checkout, '--port', String(selectedPort), '--detach', '--apply', ...common,
    ]);
    const expectedOrigin = `http://127.0.0.1:${selectedPort}`;
    if (
      !['community-server-installed-and-running', 'community-server-refreshed-and-running'].includes(setup?.status) ||
      setup.runtime !== 'native' || setup.mode !== 'detached' || setup.origin !== expectedOrigin ||
      path.resolve(setup.sourceRoot ?? '') !== checkout
    ) fail('community_native_clean_machine_setup_invalid');
    const initialStatus = await invoke(['server', 'status', ...common]);
    assertRunningStatus(initialStatus);
    const initialHttp = await verifyCommunityNativeHttpSurface(expectedOrigin, fetchImpl);

    const firstStop = await invoke(['server', 'stop', ...common]);
    if (!['community-server-stopped', 'community-server-already-stopped'].includes(firstStop?.status) || firstStop.runtime !== 'native') {
      fail('community_native_clean_machine_stop_invalid');
    }
    const firstStoppedStatus = await invoke(['server', 'status', ...common]);
    if (
      firstStoppedStatus?.status !== 'installed' || firstStoppedStatus.runtime !== 'native' ||
      firstStoppedStatus.runtimeState !== 'stopped' || firstStoppedStatus.liveness?.supervisor !== false ||
      firstStoppedStatus.liveness?.host !== false
    ) fail('community_native_clean_machine_stopped_status_invalid');
    cleanupRequired = false;

    cleanupRequired = true;
    const start = await invoke(['server', 'start', '--detach', ...common]);
    if (start?.status !== 'community-server-running' || start.runtime !== 'native' || start.origin !== expectedOrigin) {
      fail('community_native_clean_machine_start_invalid');
    }
    const startedStatus = await invoke(['server', 'status', ...common]);
    assertRunningStatus(startedStatus);
    const startedHttp = await verifyCommunityNativeHttpSurface(expectedOrigin, fetchImpl);

    const restart = await invoke(['server', 'restart', '--detach', ...common]);
    if (restart?.status !== 'community-server-restarted' || restart.runtime !== 'native' || restart.origin !== expectedOrigin) {
      fail('community_native_clean_machine_restart_invalid');
    }
    const restartedStatus = await invoke(['server', 'status', ...common]);
    assertRunningStatus(restartedStatus);
    const restartedHttp = await verifyCommunityNativeHttpSurface(expectedOrigin, fetchImpl);

    const logs = await invoke(['server', 'logs', '--tail', '200', ...common]);
    if (logs?.status !== 'community-native-logs' || !Number.isSafeInteger(logs.lineCount)) {
      fail('community_native_clean_machine_logs_invalid');
    }
    assertNoSecretLeak(logs, secrets, 'server-logs');

    const stop = await invoke(['server', 'stop', ...common]);
    if (!['community-server-stopped', 'community-server-already-stopped'].includes(stop?.status) || stop.runtime !== 'native') {
      fail('community_native_clean_machine_stop_invalid');
    }
    const stoppedStatus = await invoke(['server', 'status', ...common]);
    if (
      stoppedStatus?.status !== 'installed' || stoppedStatus.runtime !== 'native' ||
      stoppedStatus.runtimeState !== 'stopped' || stoppedStatus.liveness?.supervisor !== false ||
      stoppedStatus.liveness?.host !== false
    ) fail('community_native_clean_machine_stopped_status_invalid');
    cleanupRequired = false;

    return {
      schemaVersion: 1,
      status: 'community-native-clean-machine-passed',
      runner: String(env?.RUNNER_OS ?? process.platform),
      architecture: String(env?.RUNNER_ARCH ?? process.arch),
      postgresMajor: '17',
      packageManager: 'pnpm@11.9.0',
      dockerFree: true,
      instance: INSTANCE_NAME,
      origin: expectedOrigin,
      initialHttp,
      startedHttp,
      restartedHttp,
      lifecycle: [
        'setup', 'status', 'http', 'stop', 'status', 'start', 'status', 'http',
        'restart', 'status', 'http', 'logs', 'stop', 'status',
      ],
      credentials: { argv: false, childEnvironment: false, configRemoved: true },
    };
  } finally {
    if (cleanupRequired) {
      try { await invoke(['server', 'stop', ...common]); } catch { /* preserve the primary failure */ }
    }
    rmSync(configPath, { force: true });
  }
}

function parseOptions(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') { options.json = true; continue; }
    if (!['--checkout-root', '--data-root', '--port'].includes(arg)) fail('community_native_clean_machine_unknown_option', arg);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('community_native_clean_machine_option_value_missing', arg);
    options[arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return options;
}

const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const result = await proveCommunityNativeCleanMachine({
      checkoutRoot: options.checkoutRoot ? path.resolve(options.checkoutRoot) : process.cwd(),
      dataRoot: options.dataRoot ? path.resolve(options.dataRoot) : undefined,
      port: options.port ?? DEFAULT_PORT,
    });
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.status}\n`);
  } catch (error) {
    process.stderr.write(`[community-native-clean-machine] ${redactCommunityNativeCleanMachine(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
