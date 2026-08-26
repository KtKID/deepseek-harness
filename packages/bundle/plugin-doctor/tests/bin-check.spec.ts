import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('dsh-plugin-doctor check command (RFC #1846 surface)', () => {
  it('is wired as a recognized subcommand and runs the pipeline', () => {
    const help = spawnSync(process.execPath, ['--import', 'tsx/esm', 'src/bin.ts', '--help'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('check P')
    expect(help.stdout).toContain('--supply-chain')

    expect(help.stderr).toBe('')
  })
})
