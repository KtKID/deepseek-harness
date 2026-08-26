/**
 * Environment diagnostics for the `dsh-plugin-doctor --env` command.
 *
 * Implements the "dsh doctor" idea from
 * https://github.com/deepseek-ai/deepseek-harness/discussions/1719:
 * Node/pnpm availability, `dsh` on PATH, and Web UI port availability.
 * @module @deepseek-ai/dsh-plugin-doctor/env
 */

import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { execa } from 'execa'

/** One local executable or port availability diagnostic. */
export interface EnvCheckResult {
  name: string
  status: 'PASS' | 'WARN' | 'FAIL'
  detail: string
}

async function runQuick(command: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  const result = await execa(command, args, {
    env: scrubbedParentEnv(),
    extendEnv: false,
    maxBuffer: 64_000,
    reject: false,
    timeout: timeoutMs,
    windowsHide: true,
  })
  const output = [result.stdout, result.stderr].filter(value => value !== '').join('\n').trim()
  return {
    ok: result.exitCode === 0,
    output: output === '' && result.code !== undefined ? `${command}: ${result.code}` : output,
  }
}

function isPortFree(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port, timeout: timeoutMs })
    const done = (free: boolean): void => {
      socket.destroy()
      resolve(free)
    }
    socket.once('connect', () => { done(false) })
    socket.once('timeout', () => { done(true) })
    socket.once('error', (error: NodeJS.ErrnoException) => { done(error.code === 'ECONNREFUSED') })
  })
}

/** Replaceable process and socket probes for deterministic callers and tests. */
export interface EnvironmentProbes {
  /** Run one bounded version/help command. */
  run(command: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }>
  /** Report whether the loopback port accepts a new listener. */
  isPortFree(port: number, timeoutMs: number): Promise<boolean>
}

const defaultProbes: EnvironmentProbes = { run: runQuick, isPortFree }

/**
 * Windows-only check: can the default `/bin/bash` (used by the official
 * minimal preset) actually resolve? node-pty passes argv[0] straight to
 * CreateProcess, which does not PATH-search slash-prefixed paths, so the
 * default shellPath fails on Windows unless a real bash is configured
 * (discussion #1856).
 * @returns the Windows bash-resolution diagnostic, or a non-Windows pass.
 */
export function checkWinBash(): EnvCheckResult {
  if (process.platform !== 'win32') {
    return { name: 'win-bash', status: 'PASS', detail: 'n/a (non-Windows platform)' }
  }
  const candidates: string[] = []
  for (const dir of (process.env.PATH ?? '').split(';')) {
    if (dir !== '') candidates.push(join(dir, 'bash.exe'), join(dir, 'bash'))
  }
  for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]) {
    if (root !== undefined) {
      candidates.push(join(root, 'Git', 'bin', 'bash.exe'), join(root, 'Programs', 'Git', 'bin', 'bash.exe'))
    }
  }
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        return { name: 'win-bash', status: 'PASS', detail: `bash resolved: ${candidate}` }
      }
    } catch { /* unreadable */ }
  }
  return {
    name: 'win-bash',
    status: 'FAIL',
    detail: 'Windows bash not found on PATH or in Git for Windows locations. '
      + 'The official minimal preset defaults to /bin/bash, which cannot resolve on Windows (discussion #1856): '
      + 'install Git for Windows or WSL, or set terminal-bash.shellPath to an absolute bash.exe path.',
  }
}

/**
 * Run environment diagnostics.
 * @param port - Web UI port to probe (default 3080).
 * @param timeoutMs - per-command timeout in milliseconds.
 * @param probes - process and socket probes; defaults to the local environment.
 * @returns ordered executable, port, and Windows-shell diagnostics.
 */
export async function checkEnvironment(
  port = 3080,
  timeoutMs = 10_000,
  probes: EnvironmentProbes = defaultProbes,
): Promise<EnvCheckResult[]> {
  const checks: EnvCheckResult[] = []

  const node = await probes.run('node', ['--version'], timeoutMs)
  checks.push({
    name: 'node',
    status: node.ok ? 'PASS' : 'FAIL',
    detail: node.ok ? `node ${node.output}` : `node not runnable: ${node.output || 'spawn failed'}`,
  })

  const pnpm = await probes.run('pnpm', ['--version'], timeoutMs)
  checks.push({
    name: 'pnpm',
    status: pnpm.ok ? 'PASS' : 'WARN',
    detail: pnpm.ok ? `pnpm ${pnpm.output}` : 'pnpm not found on PATH (required for plugin build/install checks)',
  })

  const dsh = await probes.run('dsh', ['--help'], timeoutMs)
  checks.push({
    name: 'dsh-path',
    status: dsh.ok ? 'PASS' : 'WARN',
    detail: dsh.ok
      ? 'dsh executable found on PATH'
      : 'dsh not found on PATH (install @deepseek-ai/dsh or use `pnpm dlx @deepseek-ai/dsh`)',
  })

  const free = await probes.isPortFree(port, 1_500)
  checks.push({
    name: `port-${port}`,
    status: free ? 'PASS' : 'FAIL',
    detail: free ? `port ${port} is free` : `port ${port} is already in use (another dsh web instance running?)`,
  })

  checks.push(checkWinBash())

  return checks
}

/** Render environment checks into a human-readable report. */
/**
 * Render environment diagnostics for the CLI.
 * @param checks - ordered environment diagnostics.
 * @returns one line per diagnostic plus the aggregate outcome.
 */
export function formatEnvReport(checks: EnvCheckResult[]): string {
  const lines = checks.map(check => `[${check.status}] ${check.name}: ${check.detail}`)
  const ok = checks.every(check => check.status !== 'FAIL')
  lines.push(ok ? '✅ ENVIRONMENT OK' : '❌ ENVIRONMENT ISSUES FOUND')
  return lines.join('\n')
}
