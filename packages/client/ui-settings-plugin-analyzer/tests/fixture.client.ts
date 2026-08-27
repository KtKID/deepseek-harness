import type { PluginAnalyzerSnapshot } from '@deepseek-ai/dsh-host-plugin-analyzer/types'

type Phase = PluginAnalyzerSnapshot['entries'][number]['rootPhase']
type DiagnosisKind = PluginAnalyzerSnapshot['entries'][number]['diagnoses'][number]['kind']

interface EntryOptions {
  readonly entryId: string
  readonly moduleName: string
  readonly rootPhase: Phase
  readonly effects?: readonly string[]
  readonly listeners?: readonly string[]
  readonly services?: readonly string[]
  readonly dependencyStatus?: 'resolved' | 'candidate' | 'missing'
  readonly isolationCandidate?: boolean
  readonly directDependents?: readonly string[]
  readonly transitiveDependents?: readonly string[]
  readonly diagnoses?: readonly DiagnosisKind[]
  readonly diagnosisService?: string
  readonly failedChild?: boolean
}

/** Build a complete Host profile fixture while keeping each test's behavior facts explicit. */
export function entry(options: EntryOptions): PluginAnalyzerSnapshot['entries'][number] {
  const effects = options.effects ?? []
  const listeners = options.listeners ?? []
  const services = options.services ?? []
  const dependencies = options.dependencyStatus === undefined ? [] : [{
    service: 'fixtureService',
    status: options.dependencyStatus,
    provider: options.dependencyStatus === 'resolved' ? {
      plane: 'host',
      entryId: 'provider-entry',
      fiberUid: 7,
      fiberName: 'fixtureProvider',
      phase: 'active',
    } : null,
    candidate: options.dependencyStatus === 'candidate' ? {
      plane: 'host',
      entryId: 'candidate-provider-entry',
      fiberUid: 8,
      fiberName: 'candidateProvider',
      phase: 'loading',
    } : null,
    isolationCandidates: options.isolationCandidate ? [{
      plane: 'host',
      entryId: 'isolated-provider-entry',
      fiberUid: 9,
      fiberName: 'isolatedProvider',
      phase: 'active',
    }] : [],
  }]
  const hasFiber = options.rootPhase !== null
  const failedChild = options.failedChild === true
  const diagnoses = (options.diagnoses ?? []).map(kind => ({
    kind,
    severity: kind === 'isolation-mismatch' ? 'warning' : 'error',
    fiberUid: kind === 'missing-root' || !hasFiber ? null : failedChild ? 12 : 11,
    service: kind === 'missing-dependency' || kind === 'isolation-mismatch'
      ? options.diagnosisService ?? 'fixtureService'
      : null,
    error: kind === 'fiber-failed' ? 'Error: fixture failure' : null,
  }))
  return {
    plane: 'host',
    entryId: options.entryId,
    moduleName: options.moduleName,
    enabled: true,
    rootPhase: options.rootPhase,
    rootPhaseObservedSince: hasFiber ? 1_723_852_800_000 : null,
    phaseCounts: {
      pending: options.rootPhase === 'pending' ? 1 : 0,
      loading: options.rootPhase === 'loading' ? 1 : 0,
      active: options.rootPhase === 'active' ? 1 : 0,
      failed: options.rootPhase === 'failed' ? 1 : 0,
      unloading: options.rootPhase === 'unloading' ? 1 : 0,
    },
    fibers: hasFiber ? [
      {
        plane: 'host' as const,
        entryId: options.entryId,
        fiberUid: 11,
        fiberName: 'fixturePlugin',
        parentFiberUid: 1,
        phase: options.rootPhase,
        phaseObservedSince: 1_723_852_800_000,
        effectCount: effects.length,
        effectLabels: effects,
        listenerEventNames: listeners,
        providedServices: services,
        dependencies,
      },
      ...failedChild ? [{
        plane: 'host' as const,
        entryId: options.entryId,
        fiberUid: 12,
        fiberName: 'failedChildPlugin',
        parentFiberUid: 11,
        phase: 'failed' as const,
        phaseObservedSince: 1_723_852_800_000,
        effectCount: 0,
        effectLabels: [],
        listenerEventNames: [],
        providedServices: [],
        dependencies: [],
      }] : [],
    ] : [],
    contribution: {
      fiberCount: hasFiber ? (failedChild ? 2 : 1) : 0,
      effectCount: effects.length,
      effectLabels: effects,
      listenerEventNames: listeners,
      providedServices: services,
    },
    dependency: {
      declaredCount: dependencies.length,
      resolvedCount: options.dependencyStatus === 'resolved' ? 1 : 0,
      candidateCount: options.dependencyStatus === 'candidate' ? 1 : 0,
      missingCount: options.dependencyStatus === 'missing' ? 1 : 0,
      directDependentEntryIds: options.directDependents ?? [],
      transitiveDependentEntryIds: options.transitiveDependents ?? [],
    },
    activity: {
      source: 'registrations-only',
      registeredEventCount: listeners.length,
      lastDispatchAt: null,
    },
    stability: {
      transitionCount: options.entryId === 'settings-entry' ? 1 : 0,
      reloadCount: 0,
      failureCount: options.rootPhase === 'failed' ? 1 : 0,
      lastTransitionAt: options.entryId === 'settings-entry' ? 1_723_852_801_000 : null,
    },
    diagnoses,
  } as unknown as PluginAnalyzerSnapshot['entries'][number]
}

/** Build one complete snapshot with summary counts derived from its entry profiles. */
export function snapshot(
  entries: readonly PluginAnalyzerSnapshot['entries'][number][],
  history: PluginAnalyzerSnapshot['history'] = [],
): PluginAnalyzerSnapshot {
  const running = entries.filter(item => item.rootPhase === 'active').length
  return {
    plane: 'host',
    observedSince: 1_723_852_800_000,
    capturedAt: 1_723_852_802_000,
    limits: { historyLimit: 1000, historyWindowMs: 3_600_000 },
    summary: {
      enabled: entries.length,
      running,
      nonRunning: entries.length - running,
      diagnosed: entries.filter(item => item.diagnoses.length > 0).length,
      missingDependencies: entries.reduce((count, item) => count + item.dependency.missingCount, 0),
    },
    entries,
    runtimeOnlyFibers: [],
    history,
  }
}
