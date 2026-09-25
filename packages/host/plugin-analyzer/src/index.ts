/** Read-only Host plugin behavior profiles over public Cordis diagnostics. */

import {
  Context,
  type EffectMeta,
  type Fiber,
  type FiberState,
} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import type PluginInventoryGateway from '@deepseek-ai/dsh-host-plugin-inventory'
import type {
  PluginEntryId,
  PluginInventoryEntry,
} from '@deepseek-ai/dsh-host-plugin-inventory/types'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  PluginAnalyzerDependency,
  PluginAnalyzerDiagnosis,
  PluginAnalyzerEntryProfile,
  PluginAnalyzerFiberPhase,
  PluginAnalyzerFiberProfile,
  PluginAnalyzerLifecycleRecord,
  PluginAnalyzerPhaseCounts,
  PluginAnalyzerProviderRef,
  PluginAnalyzerSnapshot,
} from './types.ts'

export type * from './types.ts'

const DEFAULT_HISTORY_LIMIT = 1000
const DEFAULT_HISTORY_WINDOW_MS = 60 * 60 * 1000
const REDACTED_TOKEN = '[redacted]'

/** Bounded in-memory observation configuration. */
export interface Config {
  /** Maximum lifecycle records retained across every Host plugin. @default 1000 */
  readonly historyLimit?: number
  /** Maximum age of a retained lifecycle record in milliseconds. @default 3600000 */
  readonly historyWindowMs?: number
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: 'disposed',
  [FIBER_STATE.UNLOADING]: 'unloading',
} as const satisfies Record<FiberState, PluginAnalyzerFiberPhase>

interface EffectFacts {
  readonly count: number
  readonly labels: readonly string[]
  readonly listenerEventNames: readonly string[]
}

interface ReflectionFacts {
  readonly implementations: readonly ServiceImpl[]
  readonly providedByFiber: ReadonlyMap<Fiber, readonly string[]>
}

type ServiceImpl = NonNullable<Fiber['store']>[string]

interface CollectedFibers {
  readonly profiles: readonly PluginAnalyzerFiberProfile[]
  readonly byEntry: ReadonlyMap<PluginEntryId, readonly PluginAnalyzerFiberProfile[]>
  readonly runtimeOnly: readonly PluginAnalyzerFiberProfile[]
}

/** Convert one Fiber state to the complete diagnostic phase vocabulary. */
function phaseOf(state: FiberState): PluginAnalyzerFiberPhase {
  return FIBER_PHASE[state]
}

/** Cordis stores the startup throw privately; snapshot reads it without awaiting the Fiber. */
function fiberThrown(fiber: Fiber): unknown {
  return Reflect.get(fiber, '_error')
}

/** Render one stored throw as inspectable text. */
function formatThrown(value: unknown): string {
  if (value instanceof Error) {
    const name = value.name.length > 0 ? value.name : 'Error'
    return value.message.length > 0 ? `${name}: ${value.message}` : name
  }
  /* v8 ignore next -- plugin throws arrive as Error; keep String for other stored values. */
  return String(value)
}

/** Keep public identifier-like diagnostics and collapse arbitrary plugin text. */
function safeToken(value: string): string {
  if (!/^[A-Za-z0-9_@./:$-]{1,160}$/.test(value)) return REDACTED_TOKEN
  if (value.startsWith('/') || /^file:/i.test(value) || /^[A-Za-z]:/.test(value) || value.includes('..')) {
    return REDACTED_TOKEN
  }
  return value
}

/** Parse one Cordis string-event effect label without evaluating plugin text. */
function listenerName(label: string): string | null {
  const match = /^ctx\.on\(("(?:[^"\\]|\\.)*")\)$/.exec(label)
  if (match === null) return null
  try {
    return safeToken(JSON.parse(match.slice(1, 2).join()) as string)
  } catch {
    return null
  }
}

/** Convert framework-owned labels to a bounded public set. */
function publicEffectLabel(label: string): string {
  const eventName = listenerName(label)
  if (eventName !== null) return `ctx.on(${JSON.stringify(eventName)})`

  const provide = /^ctx\.provide\(("(?:[^"\\]|\\.)*")\)$/.exec(label)
  if (provide !== null) {
    try {
      const value = JSON.parse(provide.slice(1, 2).join()) as unknown
      if (typeof value === 'string') return `ctx.provide(${JSON.stringify(safeToken(value))})`
    } catch {
      return 'ctx.provide()'
    }
  }

  const registration = /^([A-Za-z0-9_@./:$-]+)\.register\(.*\)$/.exec(label)
  if (registration !== null) return `${safeToken(registration.slice(1, 2).join())}.register()`
  if (label === 'ctx.plugin()') return label
  return 'custom effect'
}

/** Flatten effect metadata while retaining the complete recursive count. */
function effectFacts(effects: readonly EffectMeta[]): EffectFacts {
  const labels: string[] = []
  const listenerEventNames: string[] = []
  const visit = (effect: EffectMeta): void => {
    labels.push(publicEffectLabel(effect.label))
    const eventName = listenerName(effect.label)
    if (eventName !== null) listenerEventNames.push(eventName)
    /* v8 ignore next -- Cordis currently returns flat live metadata; recursion preserves its public tree contract. */
    for (const child of effect.children) visit(child)
  }
  for (const effect of effects) visit(effect)
  return {
    count: labels.length,
    labels: uniqueSorted(labels),
    listenerEventNames: uniqueSorted(listenerEventNames),
  }
}

/** Return sorted unique strings for deterministic Remote payloads. */
function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

/** Count every live Fiber phase through a fixed-field JSON record. */
function phaseCounts(fibers: readonly PluginAnalyzerFiberProfile[]): PluginAnalyzerPhaseCounts {
  const result = {
    pending: 0,
    loading: 0,
    active: 0,
    failed: 0,
    unloading: 0,
  }
  for (const fiber of fibers) {
    /* v8 ignore next -- live collection excludes disposed Fibers before profiles are built. */
    if (fiber.phase === 'disposed') continue
    result[fiber.phase] += 1
  }
  return result
}

/** Read current service-provider ownership without reading service values. */
function reflectionFacts(ctx: Context): ReflectionFacts {
  const implementations = Reflect.ownKeys(ctx.reflect.store)
    .map(key => ctx.reflect.store[key as symbol])
    .filter((impl): impl is ServiceImpl => impl !== undefined)
  const mutable = new Map<Fiber, string[]>()
  for (const impl of implementations) {
    const names = mutable.get(impl.fiber) ?? []
    names.push(safeToken(impl.name))
    mutable.set(impl.fiber, names)
  }
  return {
    implementations,
    providedByFiber: new Map(
      [...mutable].map(([fiber, names]) => [fiber, uniqueSorted(names)]),
    ),
  }
}

/** Host Remote and collector for plugin behavior profiles. */
export class PluginAnalyzerGateway extends TypertRemoteService {
  static inject = ['loader', 'pluginInventory']

  static Config: z<Config> = z.object({
    historyLimit: z.natural().min(1).default(DEFAULT_HISTORY_LIMIT),
    historyWindowMs: z.natural().min(1).default(DEFAULT_HISTORY_WINDOW_MS),
  })

  private readonly historyLimit: number
  private readonly historyWindowMs: number
  private readonly observedSince: number
  // Captured at activation: the traceable proxy binds snapshot() to a shadow
  // context that does not carry the inject-mounted loader property.
  private readonly loader: Context['loader']
  private readonly history: PluginAnalyzerLifecycleRecord[] = []
  private readonly phaseObservedSince = new WeakMap<Fiber, number>()
  private readonly observedFiberUids = new WeakMap<Fiber, number>()
  private sequence = 0

  /**
   * Start one process-local observation window.
   * @param ctx - Host Cordis context carrying Loader and inventory services.
   * @param config - Complete-result history bounds.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'pluginAnalyzer')
    this.loader = ctx.loader
    this.historyLimit = config.historyLimit ?? DEFAULT_HISTORY_LIMIT
    this.historyWindowMs = config.historyWindowMs ?? DEFAULT_HISTORY_WINDOW_MS
    this.observedSince = Date.now()

    ctx.on('internal/plugin', (fiber) => { this.rememberFiber(fiber, Date.now()) })
    ctx.on('internal/status', (fiber, previous) => { this.recordTransition(fiber, previous, Date.now()) })
    for (const fiber of this.liveFibers()) this.rememberFiber(fiber, this.observedSince)
  }

  /**
   * Project current behavior and the retained lifecycle window without invoking inspected services.
   * @returns Redacted Host profiles, diagnoses, runtime-only Fibers, and bounded history.
   */
  @Remote('snapshot')
  async snapshot(): Promise<PluginAnalyzerSnapshot> {
    const capturedAt = Date.now()
    this.pruneHistory(capturedAt)
    const inventory = await this.inventory().list()
    const knownEntryIds = new Set(inventory.entries.map(entry => entry.entryId))
    const fibers = this.collectFibers(knownEntryIds)
    const reverseEdges = this.reverseEntryEdges(fibers.profiles)
    const entries = inventory.entries
      .filter((entry): entry is PluginInventoryEntry & { readonly enabled: true } => entry.enabled)
      .map(entry => this.entryProfile(entry, fibers.byEntry.get(entry.entryId) ?? [], reverseEdges))
    const running = entries.filter(entry => entry.rootPhase === 'active').length
    return {
      plane: 'host',
      observedSince: this.observedSince,
      capturedAt,
      limits: {
        historyLimit: this.historyLimit,
        historyWindowMs: this.historyWindowMs,
      },
      summary: {
        enabled: entries.length,
        running,
        nonRunning: entries.length - running,
        diagnosed: entries.filter(entry => entry.diagnoses.length > 0).length,
        missingDependencies: entries.reduce((count, entry) => count + entry.dependency.missingCount, 0),
      },
      entries,
      runtimeOnlyFibers: fibers.runtimeOnly,
      history: [...this.history],
    }
  }

  /**
   * Expose constant-size state for the package invariant companion.
   * @returns Retention size, bound, and sequence endpoints after time pruning.
   */
  invariantState(): {
    readonly historySize: number
    readonly historyLimit: number
    readonly oldestSequence: number | null
    readonly newestSequence: number | null
  } {
    this.pruneHistory(Date.now())
    return {
      historySize: this.history.length,
      historyLimit: this.historyLimit,
      oldestSequence: this.history[0]?.sequence ?? null,
      newestSequence: this.history.at(-1)?.sequence ?? null,
    }
  }

  /** Resolve the Loader-owned inventory service only after its declared injection is active. */
  private inventory(): PluginInventoryGateway {
    return this.ctx.get('pluginInventory') as PluginInventoryGateway
  }

  /** Enumerate each live Fiber once from the shared registry. */
  private liveFibers(): Fiber[] {
    const fibers: Fiber[] = []
    for (const runtime of this.ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        /* v8 ignore next -- registry iteration currently removes disposed null-uid Fibers synchronously. */
        if (fiber.uid !== null) fibers.push(fiber)
      }
    }
    return fibers
  }

  /** Preserve the uid and initial observed phase for later disposal transitions. */
  private rememberFiber(fiber: Fiber, observedAt: number): void {
    if (fiber.uid === null) return
    this.observedFiberUids.set(fiber, fiber.uid)
    if (!this.phaseObservedSince.has(fiber)) this.phaseObservedSince.set(fiber, observedAt)
  }

  /** Append one lifecycle transition and enforce both complete-result bounds. */
  private recordTransition(fiber: Fiber, previous: FiberState, observedAt: number): void {
    this.rememberFiber(fiber, observedAt)
    const fiberUid = fiber.uid ?? this.observedFiberUids.get(fiber)
    /* v8 ignore next -- status transitions follow uid assignment or a previously remembered live uid. */
    if (fiberUid === undefined) return
    this.phaseObservedSince.set(fiber, observedAt)
    this.history.push({
      sequence: ++this.sequence,
      plane: 'host',
      entryId: this.locatedEntryId(fiber),
      fiberUid,
      fiberName: safeToken(fiber.name),
      previousPhase: phaseOf(previous),
      nextPhase: phaseOf(fiber.state),
      observedAt,
    })
    this.pruneHistory(observedAt)
  }

  /** Remove expired records, then trim the oldest complete records by count. */
  private pruneHistory(now: number): void {
    const cutoff = now - this.historyWindowMs
    let expired = 0
    while ((this.history[expired]?.observedAt ?? Number.POSITIVE_INFINITY) < cutoff) expired += 1
    if (expired > 0) this.history.splice(0, expired)
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit)
    }
  }

  /** Read the stored throw for one failed Fiber as inspectable text. */
  private fiberFailureText(fiberUid: number): string | null {
    const fiber = this.liveFibers().find(item => item.uid === fiberUid)
    /* v8 ignore next -- diagnoses only request uids of live failed Fibers. */
    if (fiber === undefined || fiber.state !== FIBER_STATE.FAILED) return null
    const thrown = fiberThrown(fiber)
    /* v8 ignore next -- FAILED fibers retain the stored throw. */
    return thrown === undefined ? null : formatThrown(thrown)
  }

  /** Locate one Loader owner while preserving ownerless runtime Fibers. */
  private locatedEntryId(fiber: Fiber): PluginEntryId | null {
    const entryId = this.loader.locate(fiber)
    return entryId === undefined ? null : entryId as PluginEntryId
  }

  /** Convert one live provider to a value-free reference. */
  private providerRef(
    impl: ServiceImpl | undefined,
    knownEntryIds: ReadonlySet<PluginEntryId>,
  ): PluginAnalyzerProviderRef | null {
    if (impl === undefined || impl.fiber.uid === null) return null
    const located = this.locatedEntryId(impl.fiber)
    return {
      plane: 'host',
      entryId: located !== null && knownEntryIds.has(located) ? located : null,
      fiberUid: impl.fiber.uid,
      fiberName: safeToken(impl.fiber.name),
      phase: phaseOf(impl.fiber.state),
    }
  }

  /** Build one declared dependency from resolved and same-name reflection facts. */
  private dependency(
    fiber: Fiber,
    name: string,
    reflection: ReflectionFacts,
    knownEntryIds: ReadonlySet<PluginEntryId>,
  ): PluginAnalyzerDependency {
    const resolved = fiber.store?.[name]
    const isolationKey = fiber.ctx[Context.isolate][name]
    const candidate = isolationKey === undefined ? undefined : fiber.ctx.reflect.store[isolationKey]
    const provider = this.providerRef(resolved, knownEntryIds)
    const candidateRef = this.providerRef(candidate, knownEntryIds)
    const isolationCandidates = reflection.implementations
      .filter(impl => impl.name === name && impl !== candidate && impl !== resolved)
      .map(impl => this.providerRef(impl, knownEntryIds))
      .filter((ref): ref is PluginAnalyzerProviderRef => ref !== null)
      .filter((ref, index, all) => all.findIndex(item => item.fiberUid === ref.fiberUid) === index)
      .sort((left, right) => left.fiberUid - right.fiberUid)
    return {
      service: safeToken(name),
      status: provider !== null ? 'resolved' : candidateRef !== null ? 'candidate' : 'missing',
      provider,
      candidate: provider === null ? candidateRef : null,
      isolationCandidates,
    }
  }

  /** Build live Fiber profiles and group only recognized non-group Loader owners. */
  private collectFibers(knownEntryIds: ReadonlySet<PluginEntryId>): CollectedFibers {
    const reflection = reflectionFacts(this.ctx)
    const profiles = this.liveFibers().map((fiber): PluginAnalyzerFiberProfile => {
      const owner = this.locatedEntryId(fiber)
      const entryId = owner !== null && knownEntryIds.has(owner) ? owner : null
      const effects = effectFacts(fiber.getEffects())
      return {
        plane: 'host',
        entryId,
        fiberUid: fiber.uid as number,
        fiberName: safeToken(fiber.name),
        parentFiberUid: fiber.parent.fiber.uid,
        phase: phaseOf(fiber.state),
        /* v8 ignore next -- constructor seeding and internal/plugin observe every live Fiber. */
        phaseObservedSince: this.phaseObservedSince.get(fiber) ?? this.observedSince,
        effectCount: effects.count,
        effectLabels: effects.labels,
        listenerEventNames: effects.listenerEventNames,
        providedServices: reflection.providedByFiber.get(fiber) ?? [],
        dependencies: Object.keys(fiber.inject)
          .sort((left, right) => left.localeCompare(right))
          .map(name => this.dependency(fiber, name, reflection, knownEntryIds)),
      }
    })
    const mutable = new Map<PluginEntryId, PluginAnalyzerFiberProfile[]>()
    const runtimeOnly: PluginAnalyzerFiberProfile[] = []
    for (const profile of profiles) {
      if (profile.entryId === null) {
        runtimeOnly.push(profile)
        continue
      }
      const entryProfiles = mutable.get(profile.entryId) ?? []
      entryProfiles.push(profile)
      mutable.set(profile.entryId, entryProfiles)
    }
    return { profiles, byEntry: mutable, runtimeOnly }
  }

  /** Reverse exact resolved entry edges so providers expose their impact radius. */
  private reverseEntryEdges(
    fibers: readonly PluginAnalyzerFiberProfile[],
  ): ReadonlyMap<PluginEntryId, ReadonlySet<PluginEntryId>> {
    const reverse = new Map<PluginEntryId, Set<PluginEntryId>>()
    for (const fiber of fibers) {
      if (fiber.entryId === null) continue
      for (const dependency of fiber.dependencies) {
        const providerEntryId = dependency.provider?.entryId
        if (providerEntryId === null || providerEntryId === undefined || providerEntryId === fiber.entryId) continue
        const consumers = reverse.get(providerEntryId) ?? new Set<PluginEntryId>()
        consumers.add(fiber.entryId)
        reverse.set(providerEntryId, consumers)
      }
    }
    return reverse
  }

  /** Walk reverse entry edges and keep a deterministic transitive consumer set. */
  private transitiveDependents(
    entryId: PluginEntryId,
    reverseEdges: ReadonlyMap<PluginEntryId, ReadonlySet<PluginEntryId>>,
  ): PluginEntryId[] {
    const result = new Set<PluginEntryId>()
    const pending = [...(reverseEdges.get(entryId) ?? [])]
    for (const consumer of pending) {
      if (result.has(consumer)) continue
      result.add(consumer)
      pending.push(...(reverseEdges.get(consumer) ?? []))
    }
    return [...result].sort((left, right) => left.localeCompare(right))
  }

  /** Derive one entry profile from its inventory identity and attributed Fibers. */
  /**
   * Resolve one inventory entry against the Loader tree.
   * @param entryId - the inventory-projected entry id.
   * @returns the tree entry, or `undefined` when the id is not a flat-tree key
   *   (nested include rows such as `include:plugin-manager`); the profile then
   *   degrades to an unobserved root phase instead of failing the snapshot.
   */
  private resolveLoaderEntry(entryId: string): { readonly fiber?: Fiber } | undefined {
    try {
      return this.loader.resolve(entryId)
    } catch {
      // Nested include rows are projected by the inventory but not resolvable
      // as flat tree keys.
    }
    return undefined
  }

  private entryProfile(
    entry: PluginInventoryEntry & { readonly enabled: true },
    fibers: readonly PluginAnalyzerFiberProfile[],
    reverseEdges: ReadonlyMap<PluginEntryId, ReadonlySet<PluginEntryId>>,
  ): PluginAnalyzerEntryProfile {
    const dependencies = fibers.flatMap(fiber => fiber.dependencies)
    const records = this.history.filter(record => record.entryId === entry.entryId)
    const directDependentEntryIds = [...(reverseEdges.get(entry.entryId) ?? [])]
      .sort((left, right) => left.localeCompare(right))
    const diagnoses: PluginAnalyzerDiagnosis[] = []
    const loaderEntry = this.resolveLoaderEntry(entry.entryId)
    // fiberPhase null alone also covers group-realm children, whose plugins the
    // realm hosts on live fibers; only an entry with no fiber anywhere — a
    // composed row whose module never produced a Fiber — misses its root.
    if (entry.fiberPhase === null && fibers.length === 0) {
      diagnoses.push({ kind: 'missing-root', severity: 'error', fiberUid: null, service: null, error: null })
    }
    for (const fiber of fibers) {
      if (fiber.phase === 'failed') {
        diagnoses.push({
          kind: 'fiber-failed',
          severity: 'error',
          fiberUid: fiber.fiberUid,
          service: null,
          error: this.fiberFailureText(fiber.fiberUid),
        })
      }
      for (const dependency of fiber.dependencies) {
        if (dependency.status !== 'missing') continue
        diagnoses.push({
          kind: 'missing-dependency',
          severity: 'error',
          fiberUid: fiber.fiberUid,
          service: dependency.service,
          error: null,
        })
        if (dependency.isolationCandidates.length > 0) {
          diagnoses.push({
            kind: 'isolation-mismatch',
            severity: 'warning',
            fiberUid: fiber.fiberUid,
            service: dependency.service,
            error: null,
          })
        }
      }
    }
    const effectLabels = uniqueSorted(fibers.flatMap(fiber => fiber.effectLabels))
    const listenerEventNames = uniqueSorted(fibers.flatMap(fiber => fiber.listenerEventNames))
    return {
      plane: 'host',
      entryId: entry.entryId,
      moduleName: entry.moduleName,
      enabled: true,
      rootPhase: entry.fiberPhase,
      rootPhaseObservedSince: loaderEntry?.fiber === undefined
        ? null
        : this.phaseObservedSince.get(loaderEntry.fiber) ?? this.observedSince,
      phaseCounts: phaseCounts(fibers),
      fibers,
      contribution: {
        fiberCount: fibers.length,
        effectCount: fibers.reduce((count, fiber) => count + fiber.effectCount, 0),
        effectLabels,
        listenerEventNames,
        providedServices: uniqueSorted(fibers.flatMap(fiber => fiber.providedServices)),
      },
      dependency: {
        declaredCount: dependencies.length,
        resolvedCount: dependencies.filter(dependency => dependency.status === 'resolved').length,
        candidateCount: dependencies.filter(dependency => dependency.status === 'candidate').length,
        missingCount: dependencies.filter(dependency => dependency.status === 'missing').length,
        directDependentEntryIds,
        transitiveDependentEntryIds: this.transitiveDependents(entry.entryId, reverseEdges),
      },
      activity: {
        source: 'registrations-only',
        registeredEventCount: listenerEventNames.length,
        lastDispatchAt: null,
      },
      stability: {
        transitionCount: records.length,
        reloadCount: records.filter(record =>
          record.previousPhase === 'unloading' && record.nextPhase === 'loading').length,
        failureCount: records.filter(record => record.nextPhase === 'failed').length,
        lastTransitionAt: records.at(-1)?.observedAt ?? null,
      },
      diagnoses,
    }
  }
}

export default PluginAnalyzerGateway
