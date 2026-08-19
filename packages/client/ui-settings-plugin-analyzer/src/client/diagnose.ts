import type { PluginAnalyzerSnapshot } from '@deepseek-ai/dsh-host-plugin-analyzer/types'

type PluginAnalyzerEntry = PluginAnalyzerSnapshot['entries'][number]

/** User-facing diagnosis derived from one Cordis root Fiber phase. */
export type PluginAnalyzerStatus =
  | 'running'
  | 'pending'
  | 'starting'
  | 'failed'
  | 'stopping'
  | 'not-mounted'

/** One Host behavior profile plus its presentation fields. */
export interface PluginAnalyzerRow {
  /** Stable Loader-tree entry identity. */
  readonly entryId: PluginAnalyzerEntry['entryId']
  /** Exact module specifier from the Loader entry. */
  readonly moduleName: string
  /** Compact module name for the row heading. */
  readonly displayName: string
  /** Raw root Fiber phase from the Host collector. */
  readonly rootPhase: PluginAnalyzerEntry['rootPhase']
  /** Presentation status derived from `rootPhase`. */
  readonly status: PluginAnalyzerStatus
  /** Host-owned behavior facts and diagnoses. */
  readonly profile: PluginAnalyzerEntry
}

/** Complete Plugin Analyzer presentation result. */
export interface PluginAnalyzerDiagnosis {
  /** Enabled entries in Loader order. */
  readonly rows: readonly PluginAnalyzerRow[]
  /** Host-owned counts derived from the same profiles. */
  readonly summary: PluginAnalyzerSnapshot['summary']
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
  throw new Error(`unhandled Plugin Analyzer Fiber phase: ${JSON.stringify(value)}`)
}

/** Map an observed root Fiber phase to the Plugin Analyzer status vocabulary. */
function statusOf(phase: PluginAnalyzerEntry['rootPhase']): PluginAnalyzerStatus {
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
 * Add presentation fields to one Host-owned behavior snapshot.
 * @param snapshot - Current result from `pluginAnalyzer/snapshot`.
 * @returns Loader-ordered rows and the Host-derived summary.
 */
export function diagnose(snapshot: PluginAnalyzerSnapshot): PluginAnalyzerDiagnosis {
  return {
    rows: snapshot.entries.map((profile): PluginAnalyzerRow => ({
      entryId: profile.entryId,
      moduleName: profile.moduleName,
      displayName: moduleShortName(profile.moduleName),
      rootPhase: profile.rootPhase,
      status: statusOf(profile.rootPhase),
      profile,
    })),
    summary: snapshot.summary,
  }
}
