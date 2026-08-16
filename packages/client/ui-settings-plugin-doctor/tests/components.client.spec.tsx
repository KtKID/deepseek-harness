// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginDoctorSettingsTab } from '../src/client/PluginDoctorSettingsTab.tsx'
import type {
  PluginDoctorSettingsTabInjected,
  PluginDoctorSettingsTabProps,
} from '../src/client/PluginDoctorSettingsTab.tsx'
import { en, type PluginDoctorLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<PluginDoctorSettingsTabInjected['list']>>
const t = ((key: PluginDoctorLocaleKey): string => en[key]) as PluginDoctorSettingsTabProps['t']

function props(list: PluginDoctorSettingsTabInjected['list']): PluginDoctorSettingsTabProps {
  return { t, list } as PluginDoctorSettingsTabProps
}

const SNAPSHOT = {
  entries: [
    { entryId: 'settings-entry', moduleName: '@deepseek-ai/dsh-client-ui-settings', enabled: true, fiberPhase: 'active' },
    { entryId: 'missing-entry', moduleName: '@fixture/missing-plugin', enabled: true, fiberPhase: null },
    { entryId: 'failed-entry', moduleName: '@fixture/failed-plugin', enabled: true, fiberPhase: 'failed' },
    { entryId: 'disabled-entry', moduleName: '@fixture/disabled-plugin', enabled: false, fiberPhase: 'active' },
  ],
} as unknown as Snapshot

describe('PluginDoctorSettingsTab', () => {
  it('renders enabled counts, exact module names, statuses, and raw details', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    const list = vi.fn(() => deferred.promise)
    const view = render(<PluginDoctorSettingsTab {...props(list)} />)
    expect(screen.getByText(en.loading)).toBeTruthy()

    await act(async () => { deferred.resolve(SNAPSHOT) })

    expect(list).toHaveBeenCalledOnce()
    expect(view.container.querySelector('[data-doctor-count="enabled"]')?.textContent).toContain('3')
    expect(view.container.querySelector('[data-doctor-count="running"]')?.textContent).toContain('1')
    expect(view.container.querySelector('[data-doctor-count="non-running"]')?.textContent).toContain('2')
    expect(view.container.querySelectorAll('[data-plugin-doctor-entry]')).toHaveLength(3)
    expect(screen.getByText('@deepseek-ai/dsh-client-ui-settings')).toBeTruthy()
    expect(screen.getByText('@fixture/missing-plugin')).toBeTruthy()
    expect(screen.queryByText('@fixture/disabled-plugin')).toBeNull()
    expect(screen.getAllByText(en.running)).toHaveLength(2)
    expect(screen.getByText(en.notMounted)).toBeTruthy()
    expect(screen.getByText(en.failed)).toBeTruthy()

    const settings = screen.getByRole('button', { name: `ui-settings, ${en.running}` })
    fireEvent.click(settings)
    expect(screen.getByText('settings-entry')).toBeTruthy()
    expect(screen.getByText('active')).toBeTruthy()
    fireEvent.click(settings)
    expect(screen.queryByText('settings-entry')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `missing-plugin, ${en.notMounted}` }))
    expect(screen.getByText(en.noPhase)).toBeTruthy()
  })

  it('refreshes from a new point-in-time snapshot', async () => {
    const list = vi.fn<PluginDoctorSettingsTabInjected['list']>()
      .mockResolvedValueOnce(SNAPSHOT)
      .mockResolvedValueOnce({
        entries: [{
          entryId: 'new-entry',
          moduleName: '@fixture/new-plugin',
          enabled: true,
          fiberPhase: 'loading',
        }],
      } as unknown as Snapshot)
    render(<PluginDoctorSettingsTab {...props(list)} />)
    await screen.findByText('@deepseek-ai/dsh-client-ui-settings')
    fireEvent.click(screen.getByRole('button', { name: `ui-settings, ${en.running}` }))
    expect(screen.getByText('settings-entry')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.refresh }))

    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText('@fixture/new-plugin')).toBeTruthy()
    expect(screen.getByText(en.starting)).toBeTruthy()
    expect(screen.queryByText('@deepseek-ai/dsh-client-ui-settings')).toBeNull()
    expect(screen.queryByText('settings-entry')).toBeNull()
  })

  it('shows a generic failure, retries, and renders an explicit empty state', async () => {
    const list = vi.fn<PluginDoctorSettingsTabInjected['list']>()
      .mockRejectedValueOnce(new Error('private transport detail'))
      .mockResolvedValueOnce({ entries: [] })
    render(<PluginDoctorSettingsTab {...props(list)} />)

    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })

  it('contains synchronous failures and ignores completion after unmount', async () => {
    const synchronous = vi.fn(() => { throw new Error('remote unavailable') }) as PluginDoctorSettingsTabInjected['list']
    const failed = render(<PluginDoctorSettingsTab {...props(synchronous)} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    failed.unmount()

    const deferred = Promise.withResolvers<Snapshot>()
    const pending = render(<PluginDoctorSettingsTab {...props(() => deferred.promise)} />)
    pending.unmount()
    await act(async () => { deferred.resolve(SNAPSHOT) })

    const deferredFailure = Promise.withResolvers<Snapshot>()
    const rejected = render(<PluginDoctorSettingsTab {...props(() => deferredFailure.promise)} />)
    rejected.unmount()
    await act(async () => { deferredFailure.reject(new Error('late failure')) })
  })
})
