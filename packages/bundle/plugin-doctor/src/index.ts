/**
 * Plugin bundle health checks and the model-facing `plugin_check` tool.
 * @module @deepseek-ai/dsh-plugin-doctor
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type { ShellRunResult } from '@deepseek-ai/dsh-shell'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import { doctor, type DoctorCommand, type DoctorCommandResult } from './doctor.ts'

export const name = 'plugin-doctor'

/** Services required by the tool and its confined executable checks. */
export const inject = ['tools', 'shell', 'sandboxPolicy']

/** Plugin configuration supplied through cordis.yml. */
export interface Config {
  /** Per-command timeout for build, pack, install, and config checks. */
  timeoutMs?: number
  /** Maximum captured bytes per command stream. */
  maxOutputBytes?: number
  /** Executable and fixed arguments used to launch the current dsh installation. */
  dshCommand?: string[]
}

/** Runtime-validated tool configuration. */
export const Config: Schema<Config> = Schema.object({
  timeoutMs: Schema.number().min(1).default(120_000),
  maxOutputBytes: Schema.number().min(1).default(64_000),
  dshCommand: Schema.array(Schema.string().min(1)).min(1).default(['dsh']),
})

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", '\'\\\'\'')}'`
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/** Render a fixed argv vector for the platform's configured shell provider. */
function renderCommand(argv: readonly string[], platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return `& ${argv.map(quotePowerShell).join(' ')}`
  return argv.map(quotePosix).join(' ')
}

function renderShellOutput(result: ShellRunResult, timeoutMs: number): string {
  const parts = [result.stdout.text, result.stderr.text].filter(value => value !== '')
  if (result.timedOut) parts.push(`[timed out after ${timeoutMs}ms]`)
  else if (result.signal !== null) parts.push(`[killed by signal: ${result.signal}]`)
  return parts.join('\n')
}

/** Pure rendering helpers exposed for platform-independent contract tests. */
export const internals = { renderCommand, renderShellOutput }

/** Execute an approved doctor command through the deployment's shell and sandbox policy. */
async function runCommand(ctx: Context, exec: ToolExecution, request: DoctorCommand): Promise<DoctorCommandResult> {
  const sandboxPolicy = ctx.sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
  const spec = ctx.shell.resolve({
    command: renderCommand(request.argv),
    workdir: request.cwd,
    timeoutMs: request.timeoutMs,
    stdoutMaxBytes: request.maxOutputBytes,
    signal: request.signal,
    env: request.env,
    sandboxPolicy,
  })
  const execution = await ctx.shell.execute(spec)
  const result = await execution.result()
  return {
    code: result.exitCode ?? -1,
    output: renderShellOutput(result, request.timeoutMs),
  }
}

function requestsExecution(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  const args = value as Record<string, unknown>
  return args.build === true || args.full === true
}

/**
 * Register `plugin_check` and require approval before package scripts or profile installation run.
 * @param ctx - context carrying tools, the shell executor, and sandbox policy.
 * @param config - validated timeout, output, and dsh-launch settings.
 */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name !== 'plugin_check' || !requestsExecution(exec.arguments)) return next()
    return {
      kind: 'ask',
      reason: 'plugin_check will execute package build scripts and may pack and install the target into a temporary profile',
    }
  })

  ctx.tools.register(defineTool({
    name: 'plugin_check',
    description:
      'Inspect a DeepSeek Harness plugin bundle: manifest, patch, entry points, publication files, '
      + 'pre-execute side effects, and shell-launcher risks. Set build=true to execute the package build; '
      + 'set full=true to pack it and verify installation in a temporary profile. Executable checks require approval '
      + 'and run through the configured shell sandbox.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Absolute plugin bundle directory.' },
      build: { type: 'boolean', description: 'Run `pnpm run build` after approval.' },
      full: { type: 'boolean', description: 'Run pack and temporary-profile installation after approval.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          checks: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                status: { type: 'string', required: true },
                detail: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.checks.map(check => `[${check.status}] ${check.name}: ${check.detail}`).join('\n')
          + `\n${value.ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`,
      }],
    },
    async execute(args, exec) {
      if (args.dir.trim() === '') throw new Error('plugin_check: dir must be a non-empty absolute path')
      if (!args.dir.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(args.dir)) {
        throw new Error('plugin_check: dir must be an absolute path')
      }
      return doctor(args.dir, {
        build: args.build === true,
        dshCommand: config.dshCommand ?? ['dsh'],
        full: args.full === true,
        maxOutputBytes: config.maxOutputBytes ?? 64_000,
        runCommand: request => runCommand(ctx, exec, request),
        scanSupplyChain: false,
        signal: exec.signal,
        timeoutMs: config.timeoutMs ?? 120_000,
      })
    },
    isConcurrencySafe: args => !requestsExecution(args),
    presentCall: args => ({
      card: 'generic',
      title: `plugin_check: ${args.dir}`,
      kind: 'search',
      rawInput: args,
      locations: [{ path: args.dir }],
    }),
  }))
}

export * from './doctor.ts'
export * from './env-explain.ts'
export * from './env.ts'
export * from './session-log.ts'
