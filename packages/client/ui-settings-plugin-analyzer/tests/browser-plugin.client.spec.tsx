// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS } from '../src/client/index.ts'
import { PluginAnalyzerSettingsTab } from '../src/client/PluginAnalyzerSettingsTab.tsx'
import type { PluginAnalyzerSettingsTabInjected } from '../src/client/PluginAnalyzerSettingsTab.tsx'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const EMPTY = {
  plane: 'host',
  observedSince: 0,
  capturedAt: 0,
  limits: { historyLimit: 1000, historyWindowMs: 3_600_000 },
  summary: { enabled: 0, running: 0, nonRunning: 0, diagnosed: 0, missingDependencies: 0 },
  entries: [],
  runtimeOnlyFibers: [],
  history: [],
}
type SnapshotResult =
  | { readonly ok: true; readonly value: typeof EMPTY }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const snapshot = vi.fn<() => Promise<SnapshotResult>>()
    .mockResolvedValue({ ok: true, value: EMPTY })
  class RemoteService extends Service {
    readonly mounts: string[] = []

    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }

    async $mount(contribution: { readonly package: string }): Promise<() => Promise<void>> {
      this.mounts.push(contribution.package)
      const dispose = ctx.provide('remote.pluginAnalyzer', { snapshot })
      return async () => { dispose() }
    }
  }
  const remote = new RemoteService(ctx)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, remote, snapshot }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-plugin-analyzer browser plugin', () => {
  it('declares the Remote mount used by its outer lifecycle', () => {
    expect(inject).toEqual(['remote'])
  })

  it('registers a lazy localized Analyze tab and translates Remote failures', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.plugins.tab')[0]!
    expect(entry.component).toBe(PluginAnalyzerSettingsTab)
    expect(entry.options).toMatchObject({ id: 'analyzer', order: 20 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('插件分析')
    expect(b.remote.mounts).toEqual(['@deepseek-ai/dsh-host-plugin-analyzer'])
    expect(b.ctx.get('remote.pluginAnalyzer')).toBeDefined()
    expect(b.snapshot).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => PluginAnalyzerSettingsTabInjected)()
    await expect(injected.snapshot()).resolves.toEqual(EMPTY)
    b.snapshot.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(injected.snapshot()).rejects.toThrow('pluginAnalyzer.snapshot failed: REMOTE_ERROR: unavailable')
    await b.ctx.fiber.dispose()
  })

  it('follows late declaration, locale changes, declarer reload, and teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('settings.plugins.tab')).toHaveLength(1) })
    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('settings.plugins.tab')[0]!.options.label)).toBe('Plugin Analyzer')

    stop()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('settings.plugins.tab')[0]?.component).toBe(PluginAnalyzerSettingsTab)
    })

    await fiber.dispose()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
    expect(b.ctx.get('remote.pluginAnalyzer')).toBeUndefined()
    expect(() => b.locale.register(NS, 'zh', {})).not.toThrow()
    await b.ctx.fiber.dispose()
  })
})
