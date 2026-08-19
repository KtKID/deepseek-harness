import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('Plugin Analyzer bundle', () => {
  it('declares one parseable patch layer whose rows are direct dependencies', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    expect(Array.isArray(parsed)).toBe(true)
    const rows = (parsed as { insert?: { id?: string; name?: string }[] }[])
      .flatMap(patch => patch.insert ?? [])
    expect(rows).toEqual([
      { id: 'plugin-analyzer', name: '@deepseek-ai/dsh-host-plugin-analyzer', config: { historyLimit: 1000, historyWindowMs: 3_600_000 } },
      { id: 'ui-settings-plugin-analyzer', name: '@deepseek-ai/dsh-client-ui-settings-plugin-analyzer' },
    ])
    for (const row of rows) expect(manifest.dependencies).toHaveProperty(row.name!)
  })
})
