import { describe, expect, it } from 'vitest'
import { diagnose } from '../src/client/diagnose.ts'
import { entry, snapshot } from './fixture.client.ts'

const SNAPSHOT = snapshot([
  entry({ entryId: 'z-active', moduleName: '@deepseek-ai/dsh-client-ui-settings', rootPhase: 'active' }),
  entry({ entryId: 'a-pending', moduleName: 'cordis:pending-plugin', rootPhase: 'pending' }),
  entry({ entryId: 'loading-entry', moduleName: '@fixture/loading-plugin', rootPhase: 'loading' }),
  entry({ entryId: 'failed-entry', moduleName: '@fixture/failed-plugin', rootPhase: 'failed', diagnoses: 1 }),
  entry({ entryId: 'unloading-entry', moduleName: '@fixture/unloading-plugin', rootPhase: 'unloading' }),
  entry({ entryId: 'missing-entry', moduleName: '@fixture/not-mounted-plugin', rootPhase: null, diagnoses: 1 }),
])

describe('diagnose', () => {
  it('keeps Host entry order and maps every root Fiber phase', () => {
    const diagnosis = diagnose(SNAPSHOT)

    expect(diagnosis.rows.map(row => ({
      entryId: row.entryId,
      displayName: row.displayName,
      status: row.status,
      rootPhase: row.rootPhase,
    }))).toEqual([
      { entryId: 'z-active', displayName: 'ui-settings', status: 'running', rootPhase: 'active' },
      { entryId: 'a-pending', displayName: 'pending-plugin', status: 'pending', rootPhase: 'pending' },
      { entryId: 'loading-entry', displayName: 'loading-plugin', status: 'starting', rootPhase: 'loading' },
      { entryId: 'failed-entry', displayName: 'failed-plugin', status: 'failed', rootPhase: 'failed' },
      { entryId: 'unloading-entry', displayName: 'unloading-plugin', status: 'stopping', rootPhase: 'unloading' },
      { entryId: 'missing-entry', displayName: 'not-mounted-plugin', status: 'not-mounted', rootPhase: null },
    ])
    expect(diagnosis.summary).toEqual({
      enabled: 6,
      running: 1,
      nonRunning: 5,
      diagnosed: 2,
      missingDependencies: 0,
    })
  })

  it('preserves the Host zero summary', () => {
    expect(diagnose(snapshot([])).summary).toEqual({
      enabled: 0,
      running: 0,
      nonRunning: 0,
      diagnosed: 0,
      missingDependencies: 0,
    })
  })
})
