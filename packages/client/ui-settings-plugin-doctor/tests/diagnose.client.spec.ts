import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import { describe, expect, it } from 'vitest'
import { diagnose } from '../src/client/diagnose.ts'

const SNAPSHOT = {
  entries: [
    { entryId: 'z-active', moduleName: '@deepseek-ai/dsh-client-ui-settings', enabled: true, fiberPhase: 'active' },
    { entryId: 'a-pending', moduleName: 'cordis:pending-plugin', enabled: true, fiberPhase: 'pending' },
    { entryId: 'loading-entry', moduleName: '@fixture/loading-plugin', enabled: true, fiberPhase: 'loading' },
    { entryId: 'failed-entry', moduleName: '@fixture/failed-plugin', enabled: true, fiberPhase: 'failed' },
    { entryId: 'unloading-entry', moduleName: '@fixture/unloading-plugin', enabled: true, fiberPhase: 'unloading' },
    { entryId: 'missing-entry', moduleName: '@fixture/not-mounted-plugin', enabled: true, fiberPhase: null },
    { entryId: 'disabled-active', moduleName: '@fixture/disabled-plugin', enabled: false, fiberPhase: 'active' },
  ],
} as unknown as PluginInventorySnapshot

describe('diagnose', () => {
  it('keeps enabled entries in Loader order and maps every Fiber phase', () => {
    const diagnosis = diagnose(SNAPSHOT)

    expect(diagnosis.rows.map(row => ({
      entryId: row.entryId,
      displayName: row.displayName,
      status: row.status,
      fiberPhase: row.fiberPhase,
    }))).toEqual([
      { entryId: 'z-active', displayName: 'ui-settings', status: 'running', fiberPhase: 'active' },
      { entryId: 'a-pending', displayName: 'pending-plugin', status: 'pending', fiberPhase: 'pending' },
      { entryId: 'loading-entry', displayName: 'loading-plugin', status: 'starting', fiberPhase: 'loading' },
      { entryId: 'failed-entry', displayName: 'failed-plugin', status: 'failed', fiberPhase: 'failed' },
      { entryId: 'unloading-entry', displayName: 'unloading-plugin', status: 'stopping', fiberPhase: 'unloading' },
      { entryId: 'missing-entry', displayName: 'not-mounted-plugin', status: 'not-mounted', fiberPhase: null },
    ])
    expect(diagnosis.summary).toEqual({ enabled: 6, running: 1, nonRunning: 5 })
    expect(diagnosis.rows.some(row => row.entryId === 'disabled-active')).toBe(false)
  })

  it('returns zero counts for an empty enabled set', () => {
    expect(diagnose({
      entries: [{
        entryId: 'disabled',
        moduleName: '@fixture/disabled',
        enabled: false,
        fiberPhase: null,
      }],
    } as unknown as PluginInventorySnapshot).summary).toEqual({ enabled: 0, running: 0, nonRunning: 0 })
  })
})
