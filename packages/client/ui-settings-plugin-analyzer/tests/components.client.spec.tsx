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
const t = ((key: PluginAnalyzerLocaleKey, params?: Record<string, unknown>): string => {
  const template = en[key]
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return value.toString()
    }
    return match
  })
}) as PluginAnalyzerSettingsTabProps['t']

function props(snapshotRemote: PluginAnalyzerSettingsTabInjected['snapshot']): PluginAnalyzerSettingsTabProps {
  return { t, snapshot: snapshotRemote } as PluginAnalyzerSettingsTabProps
}

const SNAPSHOT = snapshot([
  entry({
    entryId: 'healthy-entry',
    moduleName: '@fixture/healthy-plugin',
    rootPhase: 'active',
    effects: ['ctx.on("fixture/event")', 'ctx.provide("fixtureService")'],
    listeners: ['fixture/event'],
    services: ['fixtureService'],
    dependencyStatus: 'resolved',
  }),
  entry({
    entryId: 'missing-dependency-entry',
    moduleName: '@fixture/missing-dependency-plugin',
    rootPhase: 'pending',
    dependencyStatus: 'missing',
    diagnoses: ['missing-dependency'],
    diagnosisService: 'testAnalyzeMailer',
    directDependents: ['downstream-one'],
    transitiveDependents: ['downstream-one', 'downstream-two'],
  }),
  entry({
    entryId: 'isolation-entry',
    moduleName: '@fixture/isolation-plugin',
    rootPhase: 'pending',
    dependencyStatus: 'missing',
    isolationCandidate: true,
    diagnoses: ['missing-dependency', 'isolation-mismatch'],
    diagnosisService: 'testAnalyzeIsolatedService',
  }),
  entry({
    entryId: 'failed-entry',
    moduleName: '@fixture/failed-plugin',
    rootPhase: 'active',
    diagnoses: ['fiber-failed'],
    failedChild: true,
  }),
  entry({
    entryId: 'missing-root-entry',
    moduleName: '@fixture/missing-root-plugin',
    rootPhase: null,
    diagnoses: ['missing-root'],
  }),
], [{
  sequence: 1,
  plane: 'host',
  entryId: 'healthy-entry',
  fiberUid: 11,
  fiberName: 'fixturePlugin',
  previousPhase: 'loading',
  nextPhase: 'active',
  observedAt: 1_723_852_801_000,
}] as unknown as Snapshot['history'])

describe('PluginAnalyzerSettingsTab', () => {
  it('opens diagnosed entries first with conclusions, exact facts, impact, and collapsed evidence', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    const snapshotRemote = vi.fn(() => deferred.promise)
    const view = render(<PluginAnalyzerSettingsTab {...props(snapshotRemote)} />)
    expect(screen.getByText(en.loading)).toBeTruthy()

    await act(async () => { deferred.resolve(SNAPSHOT) })

    expect(snapshotRemote).toHaveBeenCalledOnce()
    expect(screen.getByRole('tab', { name: /Needs attention/ }).getAttribute('aria-selected')).toBe('true')
    expect(view.container.querySelector('[data-analyzer-count="enabled"]')?.textContent).toContain('5')
    expect(view.container.querySelector('[data-analyzer-count="running"]')?.textContent).toContain('2')
    expect(view.container.querySelector('[data-analyzer-count="diagnosed"]')?.textContent).toContain('4')
    expect(view.container.querySelector('[data-analyzer-count="missing-dependencies"]')?.textContent).toContain('2')
    expect(view.container.querySelectorAll('[data-plugin-analyzer-entry]')).toHaveLength(4)
    expect(screen.queryByText('@fixture/healthy-plugin')).toBeNull()

    expect(screen.getByRole('region', { name: en.missingDependencyTitle }).textContent)
      .toContain('testAnalyzeMailer')
    expect(screen.getByRole('region', { name: en.missingDependencyTitle }).textContent)
      .toContain('2 transitive Loader entries')
    expect(screen.getByRole('region', { name: en.fiberFailedChildTitle }).textContent)
      .toContain('failed-plugin mounted child plugin failedChildPlugin (Fiber #12), which threw Error: fixture failure during startup')
    expect(screen.getByRole('region', { name: en.missingRootTitle })).toBeTruthy()

    const isolation = screen.getByRole('region', { name: en.isolationMismatchTitle })
    expect(isolation.getAttribute('data-diagnosis-kind')).toBe('isolation-mismatch')
    expect(isolation.getAttribute('data-severity')).toBe('warning')
    expect(isolation.textContent).toContain('testAnalyzeIsolatedService')
    expect(screen.queryByText('missing-dependency', { selector: 'code' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Technical evidence for isolation-plugin' }))
    const exactDiagnoses = view.container.querySelector('[data-analyzer-diagnoses]')
    expect(exactDiagnoses?.textContent).toContain('missing-dependency')
    expect(exactDiagnoses?.textContent).toContain('isolation-mismatch')
    expect(exactDiagnoses?.textContent).toContain('testAnalyzeIsolatedService')
    expect(view.container.querySelector('[data-dependency-status="missing"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Technical evidence for isolation-plugin' }))
    expect(view.container.querySelector('[data-analyzer-diagnoses]')).toBeNull()
  })

  it('keeps the complete Loader order in All plugins and renders healthy technical evidence', async () => {
    const snapshotRemote = vi.fn<PluginAnalyzerSettingsTabInjected['snapshot']>().mockResolvedValue(SNAPSHOT)
    const view = render(<PluginAnalyzerSettingsTab {...props(snapshotRemote)} />)
    await screen.findByText('@fixture/missing-dependency-plugin')

    fireEvent.click(screen.getByRole('tab', { name: /All plugins/ }))
    expect(Array.from(view.container.querySelectorAll('[data-plugin-analyzer-entry]'))
      .map(element => element.getAttribute('data-plugin-analyzer-entry'))).toEqual([
      'healthy-entry',
      'missing-dependency-entry',
      'isolation-entry',
      'failed-entry',
      'missing-root-entry',
    ])
    expect(screen.getByText(en.healthyTitle)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Technical evidence for healthy-plugin' }))
    expect(screen.getByText('ctx.on("fixture/event")')).toBeTruthy()
    expect(screen.getAllByText('fixtureService').length).toBeGreaterThan(0)
    expect(view.container.querySelector('[data-dependency-status="resolved"]')).toBeTruthy()
    expect(screen.getByText(en.registrationsOnly)).toBeTruthy()
    expect(view.container.querySelector('[data-analyzer-history]')?.textContent).toContain('loading → active')
  })

  it('filters inside the selected view, preserves summary counts, and closes hidden evidence', async () => {
    const snapshotRemote = vi.fn<PluginAnalyzerSettingsTabInjected['snapshot']>().mockResolvedValue(SNAPSHOT)
    const view = render(<PluginAnalyzerSettingsTab {...props(snapshotRemote)} />)
    await screen.findByText('@fixture/missing-dependency-plugin')

    fireEvent.click(screen.getByRole('button', { name: 'Technical evidence for missing-dependency-plugin' }))
    expect(screen.getByText('testAnalyzeMailer', { selector: 'code' })).toBeTruthy()

    const search = screen.getByRole('searchbox', { name: en.search })
    fireEvent.change(search, { target: { value: '  FAILED-ENTRY  ' } })
    expect(view.container.querySelectorAll('[data-plugin-analyzer-entry]')).toHaveLength(1)
    expect(screen.getByText('@fixture/failed-plugin')).toBeTruthy()
    expect(screen.queryByText('testAnalyzeMailer', { selector: 'code' })).toBeNull()
    expect(view.container.querySelector('[data-analyzer-count="enabled"]')?.textContent).toContain('5')
    expect(snapshotRemote).toHaveBeenCalledOnce()

    fireEvent.change(search, { target: { value: 'healthy-entry' } })
    expect(view.container.querySelectorAll('[data-plugin-analyzer-entry]')).toHaveLength(0)
    expect(screen.getByText(en.emptySearch)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /All plugins/ }))
    expect(view.container.querySelectorAll('[data-plugin-analyzer-entry]')).toHaveLength(1)
    expect(screen.getByText('@fixture/healthy-plugin')).toBeTruthy()
  })

  it('refreshes a repaired diagnosis into an active healthy row and selects All plugins', async () => {
    const broken = snapshot([
      entry({
        entryId: 'test-analyze-missing-dependency',
        moduleName: './missing-dependency.mjs',
        rootPhase: 'pending',
        dependencyStatus: 'missing',
        diagnoses: ['missing-dependency'],
        diagnosisService: 'testAnalyzeMailer',
      }),
    ])
    const repaired = snapshot([
      entry({
        entryId: 'test-analyze-missing-dependency',
        moduleName: './missing-dependency.mjs',
        rootPhase: 'active',
        dependencyStatus: 'resolved',
      }),
    ])
    const snapshotRemote = vi.fn<PluginAnalyzerSettingsTabInjected['snapshot']>()
      .mockResolvedValueOnce(broken)
      .mockResolvedValueOnce(repaired)
    const view = render(<PluginAnalyzerSettingsTab {...props(snapshotRemote)} />)
    await screen.findByRole('region', { name: en.missingDependencyTitle })

    fireEvent.click(screen.getByRole('button', { name: en.refresh }))

    await waitFor(() => { expect(snapshotRemote).toHaveBeenCalledTimes(2) })
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /All plugins/ }).getAttribute('aria-selected')).toBe('true')
    })
    expect(view.container.querySelector('[data-plugin-analyzer-entry="test-analyze-missing-dependency"]')
      ?.getAttribute('data-status')).toBe('running')
    expect(screen.getByText(en.healthyTitle)).toBeTruthy()
    expect(view.container.querySelector('[data-analyzer-count="diagnosed"]')?.textContent).toContain('0')
  })

  it('shows all-healthy, empty, generic failure, retry, and async containment states', async () => {
    const healthyRemote = vi.fn<PluginAnalyzerSettingsTabInjected['snapshot']>().mockResolvedValue(snapshot([
      entry({ entryId: 'healthy-entry', moduleName: '@fixture/healthy-plugin', rootPhase: 'active' }),
    ]))
    const healthy = render(<PluginAnalyzerSettingsTab {...props(healthyRemote)} />)
    await screen.findByText('@fixture/healthy-plugin')
    expect(screen.getByRole('tab', { name: /All plugins/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: /Needs attention/ }))
    expect(screen.getByText(en.allHealthy)).toBeTruthy()
    healthy.unmount()

    const rootFailed = snapshot([
      entry({
        entryId: 'root-failed-entry',
        moduleName: '@fixture/root-failed-plugin',
        rootPhase: 'failed',
        diagnoses: ['fiber-failed'],
      }),
    ])
    const rootView = render(<PluginAnalyzerSettingsTab {...props(async () => rootFailed)} />)
    expect((await screen.findByRole('region', { name: en.fiberFailedTitle })).textContent)
      .toContain('root-failed-plugin root Fiber #11 threw Error: fixture failure during startup')
    rootView.unmount()

    const snapshotRemote = vi.fn<PluginAnalyzerSettingsTabInjected['snapshot']>()
      .mockRejectedValueOnce(new Error('private transport detail'))
      .mockResolvedValueOnce(snapshot([]))
    const recovered = render(<PluginAnalyzerSettingsTab {...props(snapshotRemote)} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(snapshotRemote).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
    recovered.unmount()

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
