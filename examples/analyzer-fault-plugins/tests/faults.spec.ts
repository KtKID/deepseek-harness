import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Group from '@deepseek-ai/cordis-plugin-group'
import PluginInventoryGateway from '@deepseek-ai/dsh-host-plugin-inventory'
import PluginAnalyzerGateway from '@deepseek-ai/dsh-host-plugin-analyzer'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** Absolute plugin path: this suite is not a profile, so package names would not resolve. */
function pluginFile(name: string): string {
  return fileURLToPath(new URL(`../${name}`, import.meta.url))
}

async function harness(): Promise<{ ctx: Context; gateway: PluginAnalyzerGateway }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  await ctx.plugin(PluginInventoryGateway)
  await ctx.plugin(PluginAnalyzerGateway)
  return { ctx, gateway: ctx.get('pluginAnalyzer') as PluginAnalyzerGateway }
}

describe('analyzer fault plugins', () => {
  it('stays pending when unread-mail injects a missing store', async () => {
    const { ctx, gateway } = await harness()
    const entryId = await ctx.loader.create({
      name: pluginFile('unread-mail.js'),
    })
    const profile = gateway.snapshot().entries.find(entry => entry.entryId === entryId)
    expect(profile).toMatchObject({ rootPhase: 'pending' })
    expect(profile?.diagnoses).toEqual([
      expect.objectContaining({ kind: 'missing-dependency', service: 'unreadMailStore' }),
    ])
  })

  it('keeps the root active when nested-crash fails a child Fiber', async () => {
    const { ctx, gateway } = await harness()
    const entryId = await ctx.loader.create({
      name: pluginFile('nested-crash.js'),
    })
    const profile = gateway.snapshot().entries.find(entry => entry.entryId === entryId)
    expect(profile?.rootPhase).toBe('active')
    expect(profile?.diagnoses).toEqual([
      expect.objectContaining({
        kind: 'fiber-failed',
        error: 'Error: nested helper failed to start',
      }),
    ])
    expect(JSON.stringify(profile)).toContain('nested helper failed to start')
  })

  it('reports isolation-mismatch for isolated-inbox against a grouped store', async () => {
    const { ctx, gateway } = await harness()
    await ctx.loader.create({
      name: 'cordis:group',
      group: true,
      isolate: { isolatedInbox: true },
      config: [
        { id: 'isolated-inbox-store', name: pluginFile('isolated-inbox-store.js') },
      ],
    })
    const entryId = await ctx.loader.create({
      name: pluginFile('isolated-inbox.js'),
    })
    const profile = gateway.snapshot().entries.find(entry => entry.entryId === entryId)
    expect(profile?.diagnoses.map(diagnosis => diagnosis.kind)).toEqual([
      'missing-dependency',
      'isolation-mismatch',
    ])
    expect(profile?.diagnoses).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'missing-dependency', service: 'isolatedInbox' }),
      expect.objectContaining({ kind: 'isolation-mismatch', service: 'isolatedInbox' }),
    ]))
  })

  it('leaves an enabled Loader row after self-unload drops its root Fiber', async () => {
    const { ctx, gateway } = await harness()
    const entryId = await ctx.loader.create({
      name: pluginFile('self-unload.js'),
    })
    await expect.poll(() => {
      const profile = gateway.snapshot().entries.find(entry => entry.entryId === entryId)
      return profile?.diagnoses.some(diagnosis => diagnosis.kind === 'missing-root')
    }).toBe(true)
    const entry = ctx.loader.resolve(entryId)
    expect(entry.disabled).toBe(false)
    expect(gateway.snapshot().entries.find(item => item.entryId === entryId)?.rootPhase).toBe(null)
  })
})
