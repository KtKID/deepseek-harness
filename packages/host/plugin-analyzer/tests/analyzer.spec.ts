import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import PluginInventoryGateway from '@deepseek-ai/dsh-host-plugin-inventory'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import PluginAnalyzerGateway from '../src/index.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'fixture/event'(): void
    '/private/plugin/path'(): void
    'file:///private/plugin/path'(): void
    'fixture/nested-event'(): void
    'fixture/child-event'(): void
    'fixture/consumer-event'(): void
  }
}

const contexts: Context[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const provider: Plugin.Function = (ctx) => {
  ctx.provide('fixtureService', { secret: 'service-value-secret' })
  ctx.provide('service value secret', {})
  ctx.on('fixture/event', () => {})
  ctx.on('/private/plugin/path', () => {})
  ctx.on('file:///private/plugin/path', () => {})
  ctx.effect(() => () => {}, '/private/plugin/path')
  ctx.effect(() => () => {}, 'tools.register(private arguments)')
  ctx.effect(() => () => {}, '/private.register()')
  ctx.effect(() => () => {}, 'C:/private.register()')
  ctx.effect(() => () => {}, '../private.register()')
  ctx.effect(() => () => {}, 'ctx.on("\\x")')
  ctx.effect(() => () => {}, 'ctx.provide("\\x")')
  ctx.effect(() => {
    ctx.on('fixture/nested-event', () => {})
    return () => {}
  }, 'fixture.outerEffect')
  ctx.plugin(function providerChild(child) {
    child.on('fixture/child-event', () => {})
  })
}

const resolvedConsumer: Plugin.Object = {
  inject: ['fixtureService'],
  apply(ctx) {
    ctx.on('fixture/consumer-event', () => {})
  },
}

const missingConsumer: Plugin.Object = {
  inject: ['missingService'],
  apply() {},
}

const candidateConsumer: Plugin.Object = {
  inject: ['fixtureService', 'missingService'],
  apply() {},
}

const isolatedProvider: Plugin.Function = (ctx) => {
  ctx.isolate('isolatedService').provide('isolatedService', {})
}

const isolatedConsumer: Plugin.Object = {
  inject: ['isolatedService'],
  apply() {},
}

const intermediateOne: Plugin.Object = {
  inject: ['fixtureService'],
  apply(ctx) {
    ctx.provide('intermediateOneService', {})
  },
}

const intermediateTwo: Plugin.Object = {
  inject: ['fixtureService'],
  apply(ctx) {
    ctx.provide('intermediateTwoService', {})
  },
}

const diamondConsumer: Plugin.Object = {
  inject: ['intermediateOneService', 'intermediateTwoService'],
  apply() {},
}

async function harness(config: { historyLimit?: number; historyWindowMs?: number } = {}): Promise<{
  ctx: Context
  gateway: PluginAnalyzerGateway
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.provider = provider
  ctx.loader.builtins.resolvedConsumer = resolvedConsumer
  ctx.loader.builtins.missingConsumer = missingConsumer
  ctx.loader.builtins.candidateConsumer = candidateConsumer
  ctx.loader.builtins.isolatedProvider = isolatedProvider
  ctx.loader.builtins.isolatedConsumer = isolatedConsumer
  ctx.loader.builtins.intermediateOne = intermediateOne
  ctx.loader.builtins.intermediateTwo = intermediateTwo
  ctx.loader.builtins.diamondConsumer = diamondConsumer
  await ctx.plugin(PluginInventoryGateway)
  await ctx.plugin(PluginAnalyzerGateway, config)
  return {
    ctx,
    gateway: ctx.get('pluginAnalyzer') as PluginAnalyzerGateway,
  }
}

describe('PluginAnalyzerGateway', () => {
  it('publishes one direct redacted snapshot method', async () => {
    const { gateway } = await harness()
    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'pluginAnalyzer',
      namespace: 'pluginAnalyzer',
    })
    expect(remoteMethods(gateway)).toEqual([
      { method: 'snapshot', invocation: { kind: 'direct' } },
    ])
  })

  it('applies constructor defaults when used without Loader config normalization', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Loader)
    await ctx.plugin(PluginInventoryGateway)
    const gateway = new PluginAnalyzerGateway(ctx)
    expect((await gateway.snapshot()).limits).toEqual({
      historyLimit: 1000,
      historyWindowMs: 3_600_000,
    })
  })

  it('attributes contributions and exact dependency impact without reading service values', async () => {
    const { ctx, gateway } = await harness()
    const providerId = await ctx.loader.create({ name: 'cordis:provider' })
    const consumerId = await ctx.loader.create({ name: 'cordis:resolvedConsumer' })
    const missingId = await ctx.loader.create({ name: 'cordis:missingConsumer' })
    const candidateId = await ctx.loader.create({ name: 'cordis:candidateConsumer' })
    await ctx.loader.create({ name: 'cordis:isolatedProvider' })
    await ctx.loader.create({ name: 'cordis:isolatedProvider' })
    const isolatedConsumerId = await ctx.loader.create({ name: 'cordis:isolatedConsumer' })
    const intermediateOneId = await ctx.loader.create({ name: 'cordis:intermediateOne' })
    const intermediateTwoId = await ctx.loader.create({ name: 'cordis:intermediateTwo' })
    const diamondId = await ctx.loader.create({ name: 'cordis:diamondConsumer' })
    await ctx.loader.create({ name: 'cordis:provider', disabled: true })

    const snapshot = await gateway.snapshot()
    const providerProfile = snapshot.entries.find(entry => entry.entryId === providerId)!
    const consumerProfile = snapshot.entries.find(entry => entry.entryId === consumerId)!
    const missingProfile = snapshot.entries.find(entry => entry.entryId === missingId)!
    const candidateProfile = snapshot.entries.find(entry => entry.entryId === candidateId)!
    const isolatedProfile = snapshot.entries.find(entry => entry.entryId === isolatedConsumerId)!

    expect(snapshot.plane).toBe('host')
    expect(snapshot.summary).toEqual({
      enabled: 10,
      running: 7,
      nonRunning: 3,
      diagnosed: 3,
      missingDependencies: 3,
    })
    expect(providerProfile.contribution).toMatchObject({
      fiberCount: 2,
      listenerEventNames: ['[redacted]', 'fixture/child-event', 'fixture/event', 'fixture/nested-event'],
      providedServices: ['[redacted]', 'fixtureService'],
    })
    expect(providerProfile.contribution.effectLabels).toContain('custom effect')
    expect(providerProfile.contribution.effectLabels).toContain('tools.register()')
    expect(providerProfile.contribution.effectLabels).toContain('[redacted].register()')
    expect(providerProfile.contribution.effectLabels).toContain('ctx.provide()')
    expect(providerProfile.dependency.directDependentEntryIds).toEqual(
      [consumerId, intermediateOneId, intermediateTwoId].sort(),
    )
    expect(providerProfile.dependency.transitiveDependentEntryIds).toEqual(
      [consumerId, intermediateOneId, intermediateTwoId, diamondId].sort(),
    )
    const resolvedDependency = consumerProfile.fibers.flatMap(fiber => fiber.dependencies)[0]
    expect(resolvedDependency).toMatchObject({
      service: 'fixtureService',
      status: 'resolved',
    })
    expect(resolvedDependency?.provider?.entryId).toBe(providerId)
    expect(missingProfile.rootPhase).toBe('pending')
    expect(missingProfile.dependency).toMatchObject({
      declaredCount: 1,
      missingCount: 1,
    })
    expect(missingProfile.diagnoses).toEqual([
      expect.objectContaining({ kind: 'missing-dependency', service: 'missingService' }),
    ])
    expect(candidateProfile.fibers.flatMap(fiber => fiber.dependencies)).toEqual(expect.arrayContaining([
      expect.objectContaining({ service: 'fixtureService', status: 'candidate' }),
      expect.objectContaining({ service: 'missingService', status: 'missing' }),
    ]))
    expect(isolatedProfile.fibers.flatMap(fiber => fiber.dependencies)).toEqual([
      expect.objectContaining({
        service: 'isolatedService',
        status: 'missing',
        isolationCandidates: [
          expect.objectContaining({ fiberName: 'isolatedProvider' }),
          expect.objectContaining({ fiberName: 'isolatedProvider' }),
        ],
      }),
    ])
    expect(isolatedProfile.diagnoses.map(diagnosis => diagnosis.kind)).toEqual([
      'missing-dependency',
      'isolation-mismatch',
    ])
    expect(JSON.stringify(snapshot)).not.toContain('service-value-secret')
    expect(JSON.stringify(snapshot)).not.toContain('/private/plugin/path')
    expect(JSON.stringify(snapshot)).not.toContain('service value secret')
  })

  it('leaves inspected registrations unchanged across collector mount and disposal', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Loader)
    ctx.loader.builtins.provider = provider
    const providerId = await ctx.loader.create({ name: 'cordis:provider' })
    const providerFiber = ctx.loader.resolve(providerId).fiber!
    const before = providerFiber.getEffects().map(effect => effect.label)

    await ctx.plugin(PluginInventoryGateway)
    const analyzerFiber = ctx.plugin(PluginAnalyzerGateway)
    await analyzerFiber
    expect(providerFiber.getEffects().map(effect => effect.label)).toEqual(before)

    await analyzerFiber.dispose()
    expect(providerFiber.getEffects().map(effect => effect.label)).toEqual(before)
  })

  it('diagnoses transient missing roots and failed Loader-owned child Fibers', async () => {
    const { ctx, gateway } = await harness()
    const providerId = await ctx.loader.create({ name: 'cordis:provider' })
    const entry = ctx.loader.resolve(providerId)
    const failedChild = entry.fiber!.ctx.plugin(function failedChildPlugin() {
      throw new Error('private failure detail')
    })
    await expect(failedChild.await()).rejects.toThrow('private failure detail')

    let profile = (await gateway.snapshot()).entries.find(item => item.entryId === providerId)!
    expect(profile.diagnoses).toContainEqual(expect.objectContaining({
      kind: 'fiber-failed',
      fiberUid: failedChild.uid,
      error: expect.stringContaining('private failure detail') as string,
    }))
    expect(JSON.stringify(profile)).toContain('private failure detail')

    await failedChild.dispose()

    // A composed row whose module resolves to nothing never produces a root
    // Fiber, while the inventory still lists the enabled entry.
    await ctx.loader.create({ name: 'cordis:no-such-builtin' }).catch(() => undefined)
    const missingEntry = ctx.loader.entries()
      .find(entry => entry.options.name === 'cordis:no-such-builtin')
    if (missingEntry === undefined) throw new Error('unknown-module Loader entry was not composed')
    profile = (await gateway.snapshot()).entries.find(item => item.entryId === missingEntry.id)!
    expect(profile).toMatchObject({ rootPhase: null, rootPhaseObservedSince: null })
    expect(profile.diagnoses).toContainEqual({
      kind: 'missing-root',
      severity: 'error',
      fiberUid: null,
      service: null,
      error: null,
    })
  })

  it('records an Error with an empty name using Error as the label', async () => {
    const { ctx, gateway } = await harness()
    const providerId = await ctx.loader.create({ name: 'cordis:provider' })
    const entry = ctx.loader.resolve(providerId)
    const failedChild = entry.fiber!.ctx.plugin(function failedNamelessChild() {
      const error = new Error('nameless throw')
      error.name = ''
      throw error
    })
    await expect(failedChild.await()).rejects.toThrow('nameless throw')
    const profile = (await gateway.snapshot()).entries.find(item => item.entryId === providerId)!
    expect(profile.diagnoses).toContainEqual(expect.objectContaining({
      kind: 'fiber-failed',
      error: 'Error: nameless throw',
    }))
  })

  it('records an Error with an empty message as the Error name', async () => {
    const { ctx, gateway } = await harness()
    const providerId = await ctx.loader.create({ name: 'cordis:provider' })
    const entry = ctx.loader.resolve(providerId)
    const failedChild = entry.fiber!.ctx.plugin(function failedEmptyChild() {
      throw new Error('')
    })
    await expect(failedChild.await()).rejects.toThrow()
    const profile = (await gateway.snapshot()).entries.find(item => item.entryId === providerId)!
    expect(profile.diagnoses).toContainEqual(expect.objectContaining({
      kind: 'fiber-failed',
      error: 'Error',
    }))
  })

  it('records a non-Error Fiber throw as inspectable text', async () => {
    const { ctx, gateway } = await harness()
    const providerId = await ctx.loader.create({ name: 'cordis:provider' })
    const entry = ctx.loader.resolve(providerId)
    const failedChild = entry.fiber!.ctx.plugin(function failedStringChild() {
      throw 'string failure'
    })
    await expect(failedChild.await()).rejects.toThrow('string failure')
    const profile = (await gateway.snapshot()).entries.find(item => item.entryId === providerId)!
    expect(profile.diagnoses).toContainEqual(expect.objectContaining({
      kind: 'fiber-failed',
      error: 'Error: string failure',
    }))
  })

  it('retains a count- and time-bounded contiguous lifecycle suffix', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T00:00:00.000Z'))
    const { ctx, gateway } = await harness({ historyLimit: 3, historyWindowMs: 100 })
    const providerId = await ctx.loader.create({ name: 'cordis:provider' })
    const providerFiber = ctx.loader.resolve(providerId).fiber!

    await providerFiber.restart()
    const retained = (await gateway.snapshot()).history
    expect(retained).toHaveLength(3)
    expect(retained.map(record => record.sequence)).toEqual([
      retained[0]!.sequence,
      retained[0]!.sequence + 1,
      retained[0]!.sequence + 2,
    ])
    expect(gateway.invariantState()).toMatchObject({ historySize: 3, historyLimit: 3 })

    vi.advanceTimersByTime(101)
    expect((await gateway.snapshot()).history).toEqual([])
    expect(gateway.invariantState()).toMatchObject({
      historySize: 0,
      oldestSequence: null,
      newestSequence: null,
    })
  })
})
