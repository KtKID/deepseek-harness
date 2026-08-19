import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { describe, expect, it } from 'vitest'
import PluginInventoryGateway from '@deepseek-ai/dsh-host-plugin-inventory'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import PluginAnalyzerGateway from '../src/index.ts'
import * as PluginAnalyzerInvariant from '../src/invariant.ts'

type InvariantState = ReturnType<PluginAnalyzerGateway['invariantState']>

async function expectInvalid(state: InvariantState, message: string): Promise<void> {
  const ctx = new Context()
  await ctx.plugin(InvariantRegistry, { enabled: true })
  ctx.provide('pluginAnalyzer', { invariantState: () => state })
  const fiber = ctx.plugin(PluginAnalyzerInvariant)
  await expect(fiber.await()).rejects.toThrow(message)
  await ctx.fiber.dispose()
}

async function expectValid(state: InvariantState): Promise<void> {
  const ctx = new Context()
  await ctx.plugin(InvariantRegistry, { enabled: true })
  ctx.provide('pluginAnalyzer', { invariantState: () => state })
  await expect(ctx.plugin(PluginAnalyzerInvariant).await()).resolves.toBeDefined()
  await ctx.fiber.dispose()
}

describe('plugin-analyzer invariant companion', () => {
  it('checks the bounded history across lifecycle changes and companion reloads', async () => {
    const ctx = new Context()
    await ctx.plugin(Loader)
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(PluginInventoryGateway)
    await ctx.plugin(PluginAnalyzerGateway, { historyLimit: 2 })
    const companion = ctx.plugin(PluginAnalyzerInvariant)
    await expect(companion.await()).resolves.toBeDefined()

    const target = ctx.plugin(function targetPlugin() {})
    await target
    await target.restart()
    expect((ctx.get('pluginAnalyzer') as PluginAnalyzerGateway).invariantState()).toMatchObject({
      historySize: 2,
      historyLimit: 2,
    })

    await companion.dispose()
    await expect(ctx.plugin(PluginAnalyzerInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })

  it('rejects every malformed bounded-suffix state', async () => {
    await expectInvalid({
      historySize: 3,
      historyLimit: 2,
      oldestSequence: 1,
      newestSequence: 3,
    }, 'above its 2 record limit')
    await expectInvalid({
      historySize: 0,
      historyLimit: 2,
      oldestSequence: 1,
      newestSequence: null,
    }, 'empty history exposes a sequence endpoint')
    await expectInvalid({
      historySize: 0,
      historyLimit: 2,
      oldestSequence: null,
      newestSequence: 1,
    }, 'empty history exposes a sequence endpoint')
    await expectInvalid({
      historySize: 1,
      historyLimit: 2,
      oldestSequence: null,
      newestSequence: 1,
    }, 'non-empty history is missing a sequence endpoint')
    await expectInvalid({
      historySize: 1,
      historyLimit: 2,
      oldestSequence: 1,
      newestSequence: null,
    }, 'non-empty history is missing a sequence endpoint')
    await expectInvalid({
      historySize: 2,
      historyLimit: 2,
      oldestSequence: 1,
      newestSequence: 3,
    }, 'retained history is not a contiguous sequence suffix')
  })

  it('accepts an empty bounded suffix', async () => {
    await expectValid({
      historySize: 0,
      historyLimit: 2,
      oldestSequence: null,
      newestSequence: null,
    })
  })
})
