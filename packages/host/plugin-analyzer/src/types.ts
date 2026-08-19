import type {
  PluginEntryId,
  PluginFiberPhase,
} from '@deepseek-ai/dsh-host-plugin-inventory/types'

export type { PluginEntryId, PluginFiberPhase } from '@deepseek-ai/dsh-host-plugin-inventory/types'

/** Runtime process observed by one Plugin Analyzer collector. */
export type PluginAnalyzerPlane = 'host' | 'client'

/** Complete Cordis Fiber phase vocabulary used by current and historical observations. */
export type PluginAnalyzerFiberPhase = Exclude<PluginFiberPhase, null> | 'disposed'

/** Dependency-resolution fact available through public Cordis diagnostics. */
export type PluginAnalyzerDependencyStatus = 'resolved' | 'candidate' | 'missing'

/** Severity attached to one fact-derived diagnosis. */
export type PluginAnalyzerSeverity = 'warning' | 'error'

/** Diagnosis kinds derived without invoking an inspected plugin. */
export type PluginAnalyzerDiagnosisKind =
  | 'missing-root'
  | 'missing-dependency'
  | 'isolation-mismatch'
  | 'fiber-failed'

/** Stable counts for every live Cordis Fiber phase. */
export interface PluginAnalyzerPhaseCounts {
  readonly pending: number
  readonly loading: number
  readonly active: number
  readonly failed: number
  readonly unloading: number
}

/** One live provider identified without exposing its service value. */
export interface PluginAnalyzerProviderRef {
  readonly plane: PluginAnalyzerPlane
  readonly entryId: PluginEntryId | null
  readonly fiberUid: number
  readonly fiberName: string
  readonly phase: PluginAnalyzerFiberPhase
}

/** One declared Fiber dependency and the public facts available for its resolution. */
export interface PluginAnalyzerDependency {
  readonly service: string
  readonly status: PluginAnalyzerDependencyStatus
  /** Exact provider captured by `fiber.store` while the consumer is loaded. */
  readonly provider: PluginAnalyzerProviderRef | null
  /** Same-isolation implementation visible in reflection while exact resolution is unavailable. */
  readonly candidate: PluginAnalyzerProviderRef | null
  /** Same-named implementations in other isolation locations. */
  readonly isolationCandidates: readonly PluginAnalyzerProviderRef[]
}

/** Read-only behavior facts for one live Cordis Fiber. */
export interface PluginAnalyzerFiberProfile {
  readonly plane: PluginAnalyzerPlane
  readonly entryId: PluginEntryId | null
  readonly fiberUid: number
  readonly fiberName: string
  readonly parentFiberUid: number | null
  readonly phase: PluginAnalyzerFiberPhase
  readonly phaseObservedSince: number
  readonly effectCount: number
  readonly effectLabels: readonly string[]
  readonly listenerEventNames: readonly string[]
  readonly providedServices: readonly string[]
  readonly dependencies: readonly PluginAnalyzerDependency[]
}

/** Contribution totals derived from the same Fiber profiles returned for an entry. */
export interface PluginAnalyzerContributionMetrics {
  readonly fiberCount: number
  readonly effectCount: number
  readonly effectLabels: readonly string[]
  readonly listenerEventNames: readonly string[]
  readonly providedServices: readonly string[]
}

/** Dependency totals and provider impact derived from exact resolved edges. */
export interface PluginAnalyzerDependencyMetrics {
  readonly declaredCount: number
  readonly resolvedCount: number
  readonly candidateCount: number
  readonly missingCount: number
  readonly directDependentEntryIds: readonly PluginEntryId[]
  readonly transitiveDependentEntryIds: readonly PluginEntryId[]
}

/** Activity availability for the foundation collector. */
export interface PluginAnalyzerActivityMetrics {
  readonly source: 'registrations-only'
  readonly registeredEventCount: number
  readonly lastDispatchAt: null
}

/** Lifecycle churn observed after the collector mounted. */
export interface PluginAnalyzerStabilityMetrics {
  readonly transitionCount: number
  readonly reloadCount: number
  readonly failureCount: number
  readonly lastTransitionAt: number | null
}

/** One actionable diagnosis with the exact Fiber or service fact that produced it. */
export interface PluginAnalyzerDiagnosis {
  readonly kind: PluginAnalyzerDiagnosisKind
  readonly severity: PluginAnalyzerSeverity
  readonly fiberUid: number | null
  readonly service: string | null
}

/** Behavior profile for one enabled non-group Loader entry. */
export interface PluginAnalyzerEntryProfile {
  readonly plane: PluginAnalyzerPlane
  readonly entryId: PluginEntryId
  readonly moduleName: string
  readonly enabled: true
  readonly rootPhase: PluginFiberPhase
  readonly rootPhaseObservedSince: number | null
  readonly phaseCounts: PluginAnalyzerPhaseCounts
  readonly fibers: readonly PluginAnalyzerFiberProfile[]
  readonly contribution: PluginAnalyzerContributionMetrics
  readonly dependency: PluginAnalyzerDependencyMetrics
  readonly activity: PluginAnalyzerActivityMetrics
  readonly stability: PluginAnalyzerStabilityMetrics
  readonly diagnoses: readonly PluginAnalyzerDiagnosis[]
}

/** One lifecycle transition retained inside the bounded observation window. */
export interface PluginAnalyzerLifecycleRecord {
  readonly sequence: number
  readonly plane: PluginAnalyzerPlane
  readonly entryId: PluginEntryId | null
  readonly fiberUid: number
  readonly fiberName: string
  readonly previousPhase: PluginAnalyzerFiberPhase
  readonly nextPhase: PluginAnalyzerFiberPhase
  readonly observedAt: number
}

/** Configured limits governing the complete retained lifecycle result. */
export interface PluginAnalyzerObservationLimits {
  readonly historyLimit: number
  readonly historyWindowMs: number
}

/** Counts derived from the enabled entry profiles in one snapshot. */
export interface PluginAnalyzerSummary {
  readonly enabled: number
  readonly running: number
  readonly nonRunning: number
  readonly diagnosed: number
  readonly missingDependencies: number
}

/** Complete redacted Host behavior snapshot returned by `pluginAnalyzer/snapshot`. */
export interface PluginAnalyzerSnapshot {
  readonly plane: 'host'
  readonly observedSince: number
  readonly capturedAt: number
  readonly limits: PluginAnalyzerObservationLimits
  readonly summary: PluginAnalyzerSummary
  readonly entries: readonly PluginAnalyzerEntryProfile[]
  readonly runtimeOnlyFibers: readonly PluginAnalyzerFiberProfile[]
  readonly history: readonly PluginAnalyzerLifecycleRecord[]
}
