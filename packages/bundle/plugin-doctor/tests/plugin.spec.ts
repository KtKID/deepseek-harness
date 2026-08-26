import { afterEach, describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, internals } from '../src/index.js'

interface RegisteredTool {
  name: string
  execute(args: { dir: string; build?: boolean; full?: boolean }, exec: {
    agent?: { session: unknown }
    signal: AbortSignal
  }): Promise<unknown>
  isConcurrencySafe(args: { dir: string; build?: boolean; full?: boolean }): boolean
  output: {
    render(args: unknown, value: { ok: boolean; checks: Array<{ name: string; status: string; detail: string }> }): unknown
  }
  presentCall(args: { dir: string }): unknown
}

type PreExecuteListener = (
  exec: { name: string; arguments: unknown },
  next: () => Promise<{ kind: 'allow' }>,
) => Promise<{ kind: 'allow' } | { kind: 'ask'; reason: string }>

const temporaryFixtures: string[] = []

function fixture(name: string): string {
  const source = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-doctor-fixture-'))
  temporaryFixtures.push(root)
  cpSync(source, root, { recursive: true })
  writeFileSync(join(root, 'cordis.patch.yml'), '- insert:\n    - id: good-hello\n      name: good-plugin\n')
  return root
}

afterEach(() => {
  for (const root of temporaryFixtures.splice(0)) rmSync(root, { force: true, recursive: true })
})

function makeCtx(shellResult: {
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  stdout: { text: string }
  stderr: { text: string }
} = {
  exitCode: 0,
  signal: null,
  timedOut: false,
  stdout: { text: '' },
  stderr: { text: '' },
}) {
  const registered: unknown[] = []
  const listeners: unknown[] = []
  const shellRequests: unknown[] = []
  const sandboxResolutions: unknown[] = []
  const ctx = {
    on: (_event: string, listener: unknown) => {
      listeners.push(listener)
      return () => {}
    },
    sandboxPolicy: {
      resolve: (request: unknown) => {
        sandboxResolutions.push(request)
        return { mode: 'workspace-write', workspaceRoot: process.cwd() }
      },
    },
    shell: {
      resolve: (request: unknown) => {
        shellRequests.push(request)
        return request
      },
      run: async () => shellResult,
    },
    tools: {
      register: (definition: unknown) => {
        registered.push(definition)
        return () => {}
      },
    },
  }
  return {
    ctx: ctx as never,
    listener: () => listeners[0] as PreExecuteListener,
    sandboxResolutions,
    shellRequests,
    tool: () => registered[0] as RegisteredTool,
  }
}

describe('plugin shell', () => {
  it('registers one tool and asks before executable checks', async () => {
    const harness = makeCtx()
    apply(harness.ctx, { timeoutMs: 5_000 })
    expect(harness.tool().name).toBe('plugin_check')

    const decision = await harness.listener()(
      { name: 'plugin_check', arguments: { build: true } },
      async () => ({ kind: 'allow' }),
    )
    expect(decision).toMatchObject({ kind: 'ask' })
  })

  it('delegates static and unrelated pre-execute calls', async () => {
    const harness = makeCtx()
    apply(harness.ctx)
    let delegated = 0
    const next = async () => {
      delegated += 1
      return { kind: 'allow' as const }
    }
    expect(await harness.listener()({ name: 'plugin_check', arguments: { build: false } }, next))
      .toEqual({ kind: 'allow' })
    expect(await harness.listener()({ name: 'other', arguments: { build: true } }, next))
      .toEqual({ kind: 'allow' })
    expect(await harness.listener()({ name: 'plugin_check', arguments: null }, next))
      .toEqual({ kind: 'allow' })
    expect(delegated).toBe(3)
  })

  it('runs static checks without a child process', async () => {
    const harness = makeCtx()
    apply(harness.ctx, { timeoutMs: 5_000 })
    const result = await harness.tool().execute(
      { dir: fixture('good-plugin') },
      { signal: new AbortController().signal },
    )
    expect(result).toMatchObject({ ok: true })
    expect(harness.shellRequests).toHaveLength(0)
  })

  it('routes approved build checks through the configured shell sandbox', async () => {
    const harness = makeCtx()
    apply(harness.ctx, { timeoutMs: 5_000, maxOutputBytes: 1234 })
    const result = await harness.tool().execute(
      { dir: fixture('good-plugin'), build: true },
      { signal: new AbortController().signal },
    )
    expect(result).toMatchObject({ ok: true })
    expect(harness.shellRequests).toEqual([expect.objectContaining({
      command: "'pnpm' 'run' 'build'",
      stdoutMaxBytes: 1234,
      timeoutMs: 5_000,
    })])
  })

  it('uses session policy and defaults when the shell reports no exit code', async () => {
    const harness = makeCtx({
      exitCode: null,
      signal: null,
      timedOut: false,
      stdout: { text: '' },
      stderr: { text: '' },
    })
    apply(harness.ctx)
    const session = { id: 'session-1' }
    const result = await harness.tool().execute(
      { dir: fixture('good-plugin'), build: true },
      { agent: { session }, signal: new AbortController().signal },
    )
    expect(result).toMatchObject({ ok: false })
    expect(harness.sandboxResolutions).toEqual([{ session }])
    expect(harness.shellRequests).toEqual([expect.objectContaining({
      stdoutMaxBytes: 64_000,
      timeoutMs: 120_000,
    })])
  })

  it('rejects relative directories before inspection', async () => {
    const harness = makeCtx()
    apply(harness.ctx)
    await expect(harness.tool().execute(
      { dir: 'relative/plugin' },
      { signal: new AbortController().signal },
    )).rejects.toThrow('absolute path')
    await expect(harness.tool().execute(
      { dir: '   ' },
      { signal: new AbortController().signal },
    )).rejects.toThrow('non-empty absolute path')
  })

  it('renders platform commands, results, concurrency, and call presentation', () => {
    expect(internals.renderCommand(['tool', "a'b"])).toBe("'tool' 'a'\\''b'")
    expect(internals.renderCommand(['tool', "a'b"], 'win32')).toBe("& 'tool' 'a''b'")
    expect(internals.renderShellOutput({
      stdout: { text: 'out' },
      stderr: { text: 'err' },
      timedOut: true,
    } as never, 25)).toBe('out\nerr\n[timed out after 25ms]')
    expect(internals.renderShellOutput({
      stdout: { text: '' },
      stderr: { text: '' },
      timedOut: false,
      signal: 'SIGTERM',
    } as never, 25)).toBe('[killed by signal: SIGTERM]')

    const harness = makeCtx()
    apply(harness.ctx)
    expect(harness.tool().isConcurrencySafe({ dir: '/tmp/plugin' })).toBe(true)
    expect(harness.tool().isConcurrencySafe({ dir: '/tmp/plugin', full: true })).toBe(false)
    expect(harness.tool().presentCall({ dir: '/tmp/plugin' })).toMatchObject({
      kind: 'search',
      locations: [{ path: '/tmp/plugin' }],
    })
    expect(harness.tool().output.render({}, {
      ok: false,
      checks: [{ name: 'manifest', status: 'FAIL', detail: 'missing' }],
    })).toEqual([{ type: 'text', text: '[FAIL] manifest: missing\nSOME CHECKS FAILED' }])
    expect(harness.tool().output.render({}, {
      ok: true,
      checks: [{ name: 'manifest', status: 'PASS', detail: 'valid' }],
    })).toEqual([{ type: 'text', text: '[PASS] manifest: valid\nALL CHECKS PASSED' }])
  })
})
