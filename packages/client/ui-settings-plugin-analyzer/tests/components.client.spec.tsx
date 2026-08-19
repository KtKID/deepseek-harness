// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginAnalyzerSettingsTab } from '../src/client/PluginAnalyzerSettingsTab.tsx'
import type {
  PluginAnalyzerSettingsTabInjected,
  PluginAnalyzerSettingsTabProps,
} from '../src/client/PluginAnalyzerSettingsTab.tsx'
import { en, type PluginAnalyzerLocaleKey } from '../src/client/locales.ts'
import { entry, snapshot } from './fixture.client.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<PluginAnalyzerSettingsTabInjected['snapshot']>>
const t = ((key: PluginAnalyzerLocaleKey): string => en[key]) as PluginAnalyzerSettingsTabProps['t']

function props(snapshotRemote: PluginAnalyzerSettingsTabInjected['snapshot']): PluginAnalyzerSettingsTabProps {
  return { t, snapshot: snapshotRemote } as PluginAnalyzerSettingsTabProps
}

const SNAPSHOT = snapshot([
  entry({
    entryId: 'settings-entry',
    moduleName: '@deepseek-ai/dsh-client-ui-settings',
    rootPhase: 'active',
    effects: ['ctx.on("fixture/event")', 'ctx.provide("fixtureService")'],
    listeners: ['fixture/event'],
    services: ['fixtureService'],
    dependencyStatus: 'resolved',
    directDependents: ['dependent-one'],
    transitiveDependents: ['dependent-one', 'dependent-two'],
  }),
  entry({ entryId: 'missing-entry', moduleName: '@fixture/missing-plugin', rootPhase: null, diagnoses: 1 }),
  entry({
    entryId: 'failed-entry',
    moduleName: '@fixture/failed-plugin',
    rootPhase: 'failed',
    dependencyStatus: 'missing',
    diagnoses: 2,
  }),
  entry({
    entryId: 'candidate-entry',
    moduleName: '@fixture/candidate-plugin',
    rootPhase: 'active',
    dependencyStatus: 'candidate',
    isolationCandidate: true,
  }),
], [{
  sequence: 1,
  plane: 'host',
  entryId: 'settings-entry',
  fiberUid: 11,
  fiberName: 'fixturePlugin',
  previousPhase: 'loading',
  nextPhase: 'active',
  observedAt: 1_723_852_801_000,
}] as unknown as Snapshot['history'])

describe('PluginAnalyzerSettingsTab', () => {
  it('renders behavior metrics and expands contribution, dependency, and lifecycle facts', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    const snapshotRemote = vi.fn(() => deferred.promise)
    const view = render(<PluginAnalyzerSettingsTab {...props(snapshotRemote)} />)
    expect(screen.getByText(en.loading)).toBeTruthy()

    await act(async () => { deferred.resolve(SNAPSHOT) })

    expect(snapshotRemote).toHaveBeenCalledOnce()
    expect(view.container.querySelector('[data-analyzer-count="enabled"]')?.textContent).toContain('4')
    expect(view.container.querySelector('[data-analyzer-count="running"]')?.textContent).toContain('2')
    expect(view.container.querySelector('[data-analyzer-count="diagnosed"]')?.textContent).toContain('2')
    expect(view.container.querySelector('[data-analyzer-count="missing-dependencies"]')?.textContent).toContain('1')
    expect(view.container.querySelectorAll('[data-plugin-analyzer-entry]')).toHaveLength(4)
    expect(screen.getByText('@deepseek-ai/dsh-client-ui-settings')).toBeTruthy()
    expect(screen.getByText(en.notMounted)).toBeTruthy()
    expect(screen.getByText(en.failed)).toBeTruthy()

    const settings = screen.getByRole('button', { name: `ui-settings, ${en.running}` })
    expect(settings.querySelector('[data-analyzer-metric="effects"]')?.textContent).toContain('2')
    expect(settings.querySelector('[data-analyzer-metric="listeners"]')?.textContent).toContain('1')
    fireEvent.click(settings)
    expect(screen.getByText('settings-entry')).toBeTruthy()
    expect(screen.getByText('ctx.on("fixture/event")')).toBeTruthy()
    expect(screen.getAllByText('fixtureService').length).toBeGreaterThan(0)
    expect(view.container.querySelector('[data-dependency-status="resolved"]')).toBeTruthy()
    expect(screen.getByText('dependent-one, dependent-two')).toBeTruthy()
    expect(view.container.querySelector('[data-analyzer-history]')?.textContent).toContain('loading → active')
    fireEvent.click(settings)
    expect(screen.queryByText('settings-entry')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `candidate-plugin, ${en.running}` }))
    expect(screen.getByText(en.candidate)).toBeTruthy()
    expect(screen.getByText(en.isolationCandidates)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: `missing-plugin, ${en.notMounted}` }))
    expect(screen.getByText(en.noPhase, { selector: 'code' })).toBeTruthy()
  })

  it('refreshes from a new point-in-time snapshot', async () => {
    const snapshotRemote = vi.fn<PluginAnalyzerSettingsTabInjected['snapshot']>()
      .mockResolvedValueOnce(SNAPSHOT)
      .mockResolvedValueOnce(snapshot([
        entry({ entryId: 'new-entry', moduleName: '@fixture/new-plugin', rootPhase: 'loading' }),
      ]))
    render(<PluginAnalyzerSettingsTab {...props(snapshotRemote)} />)
    await screen.findByText('@deepseek-ai/dsh-client-ui-settings')
    fireEvent.click(screen.getByRole('button', { name: `ui-settings, ${en.running}` }))
    expect(screen.getByText('settings-entry')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.refresh }))

    await waitFor(() => { expect(snapshotRemote).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText('@fixture/new-plugin')).toBeTruthy()
    expect(screen.getByText(en.starting)).toBeTruthy()
    expect(screen.queryByText('@deepseek-ai/dsh-client-ui-settings')).toBeNull()
    expect(screen.queryByText('settings-entry')).toBeNull()
  })

  it('shows a generic failure, retries, and renders an explicit empty state', async () => {
    const snapshotRemote = vi.fn<PluginAnalyzerSettingsTabInjected['snapshot']>()
      .mockRejectedValueOnce(new Error('private transport detail'))
      .mockResolvedValueOnce(snapshot([]))
    render(<PluginAnalyzerSettingsTab {...props(snapshotRemote)} />)

    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(snapshotRemote).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })

  it('contains synchronous failures and ignores completion after unmount', async () => {
    const synchronous = vi.fn(() => { throw new Error('remote unavailable') }) as PluginAnalyzerSettingsTabInjected['snapshot']
    const failed = render(<PluginAnalyzerSettingsTab {...props(synchronous)} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    failed.unmount()

    const deferred = Promise.withResolvers<Snapshot>()
    const pending = render(<PluginAnalyzerSettingsTab {...props(() => deferred.promise)} />)
    pending.unmount()
    await act(async () => { deferred.resolve(SNAPSHOT) })

    const deferredFailure = Promise.withResolvers<Snapshot>()
    const rejected = render(<PluginAnalyzerSettingsTab {...props(() => deferredFailure.promise)} />)
    rejected.unmount()
    await act(async () => { deferredFailure.reject(new Error('late failure')) })
  })
})
