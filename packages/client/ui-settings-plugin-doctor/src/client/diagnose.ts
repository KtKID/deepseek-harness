import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'

type PluginInventoryEntry = PluginInventorySnapshot['entries'][number]

/** User-facing diagnosis derived from one Cordis root Fiber phase. */
export type PluginDoctorStatus =
  | 'running'
  | 'pending'
  | 'starting'
  | 'failed'
  | 'stopping'
  | 'not-mounted'

/** One enabled Loader entry and its point-in-time runtime diagnosis. */
export interface PluginDoctorRow {
  /** Stable Loader-tree entry identity. */
  readonly entryId: PluginInventoryEntry['entryId']
  /** Exact module specifier from the Loader entry. */
  readonly moduleName: string
  /** Compact module name for the row heading. */
  readonly displayName: string
  /** Raw root Fiber phase from the Host inventory. */
  readonly fiberPhase: PluginInventoryEntry['fiberPhase']
  /** Presentation status derived from `fiberPhase`. */
  readonly status: PluginDoctorStatus
}

/** Aggregate counts derived from the same rows rendered by Plugin Doctor. */
export interface PluginDoctorSummary {
  /** Number of enabled Loader entries. */
  readonly enabled: number
  /** Number of enabled entries with an active root Fiber. */
  readonly running: number
  /** Number of enabled entries in every other observed state. */
  readonly nonRunning: number
}

/** Complete point-in-time Plugin Doctor result. */
export interface PluginDoctorDiagnosis {
  /** Enabled entries in Loader order. */
  readonly rows: readonly PluginDoctorRow[]
  /** Counts derived from `rows`. */
  readonly summary: PluginDoctorSummary
}

/** Compact a module specifier while preserving the exact value separately. */
function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

/** Closed-union exhaustiveness fence for Host Fiber phases. */
/* v8 ignore next 3 -- closed Host projection union; only reached if a phase is forged */
function assertNever(value: never): never {
  throw new Error(`unhandled Plugin Doctor Fiber phase: ${JSON.stringify(value)}`)
}

/** Map an observed root Fiber phase to the Plugin Doctor status vocabulary. */
function statusOf(phase: PluginInventoryEntry['fiberPhase']): PluginDoctorStatus {
  if (phase === null) return 'not-mounted'
  switch (phase) {
    case 'active': return 'running'
    case 'pending': return 'pending'
    case 'loading': return 'starting'
    case 'failed': return 'failed'
    case 'unloading': return 'stopping'
    /* v8 ignore next -- closed Host projection union */
    default: return assertNever(phase)
  }
}

/**
 * Derive enabled-plugin runtime rows and counts from one Host inventory snapshot.
 * @param snapshot - Current Loader inventory returned by `pluginInventory/list`.
 * @returns Enabled entries in Loader order with status counts from the same rows.
 */
export function diagnose(snapshot: PluginInventorySnapshot): PluginDoctorDiagnosis {
  const rows = snapshot.entries
    .filter(entry => entry.enabled)
    .map((entry): PluginDoctorRow => ({
      entryId: entry.entryId,
      moduleName: entry.moduleName,
      displayName: moduleShortName(entry.moduleName),
      fiberPhase: entry.fiberPhase,
      status: statusOf(entry.fiberPhase),
    }))
  const running = rows.filter(row => row.status === 'running').length
  return {
    rows,
    summary: {
      enabled: rows.length,
      running,
      nonRunning: rows.length - running,
    },
  }
}
