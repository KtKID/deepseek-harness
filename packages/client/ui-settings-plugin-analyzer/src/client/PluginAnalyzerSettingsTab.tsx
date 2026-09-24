import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import type {
  PluginAnalyzerDiagnosis as HostDiagnosis,
  PluginAnalyzerDiagnosisKind,
  PluginAnalyzerSnapshot,
} from '@deepseek-ai/dsh-host-plugin-analyzer/types'
import {
  IconCheckOutlineRegular,
  IconSearchOutlineRegular,
  IconWarningOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { diagnose, type PluginAnalyzerRow, type PluginAnalyzerStatus } from './diagnose.ts'
import type { PluginAnalyzerLocaleKey } from './locales.ts'
import css from './PluginAnalyzerSettingsTab.module.css'

/** Registration-side Remote face used by the Plugin Analyzer tab. */
export interface PluginAnalyzerSettingsTabInjected {
  /** Read the current Host behavior snapshot and retained lifecycle window. */
  snapshot: () => Promise<PluginAnalyzerSnapshot>
}

/** Full component props assembled by the Settings slot renderer. */
export type PluginAnalyzerSettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginAnalyzer'>
  & InjectFace<PluginAnalyzerSettingsTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginAnalyzerSnapshot }

type AnalyzerView = 'attention' | 'all'

const STATUS_KEYS = {
  running: 'running',
  pending: 'pending',
  starting: 'starting',
  failed: 'failed',
  stopping: 'stopping',
  'not-mounted': 'notMounted',
} satisfies Record<PluginAnalyzerStatus, PluginAnalyzerLocaleKey>

const DEPENDENCY_KEYS = {
  resolved: 'resolved',
  candidate: 'candidate',
  missing: 'missing',
} as const satisfies Record<string, PluginAnalyzerLocaleKey>

const DIAGNOSIS_COPY = {
  'missing-dependency': {
    title: 'missingDependencyTitle',
    reason: 'missingDependencyReason',
    action: 'missingDependencyAction',
  },
  'isolation-mismatch': {
    title: 'isolationMismatchTitle',
    reason: 'isolationMismatchReason',
    action: 'isolationMismatchAction',
  },
  'fiber-failed': {
    title: 'fiberFailedTitle',
    reason: 'fiberFailedReason',
    action: 'fiberFailedAction',
  },
  'missing-root': {
    title: 'missingRootTitle',
    reason: 'missingRootReason',
    action: 'missingRootAction',
  },
} as const satisfies Record<PluginAnalyzerDiagnosisKind, {
  readonly title: PluginAnalyzerLocaleKey
  readonly reason: PluginAnalyzerLocaleKey
  readonly action: PluginAnalyzerLocaleKey
}>

/** Whether one diagnosis row matches the normalized local search query. */
function matches(row: PluginAnalyzerRow, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [row.displayName, row.moduleName, row.entryId]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/** Render one compact metric with a stable test selector. */
function Metric({ label, name, value }: { label: string; name: string; value: number }): ReactNode {
  return (
    <span className={css.metric} data-analyzer-metric={name}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  )
}

/** Whether the failed Fiber is nested under another Fiber of the same Loader entry. */
function failedFiberIsChild(row: PluginAnalyzerRow, fiberUid: number | null): boolean {
  if (fiberUid === null) return false
  const uids = new Set(row.profile.fibers.map(fiber => fiber.fiberUid))
  const failed = row.profile.fibers.find(fiber => fiber.fiberUid === fiberUid)
  return failed !== undefined && failed.parentFiberUid !== null && uids.has(failed.parentFiberUid)
}

/** Render the primary fact-derived diagnosis before framework-level evidence. */
function DiagnosisSummary({
  diagnosis,
  row,
  t,
}: {
  diagnosis: HostDiagnosis
  row: PluginAnalyzerRow
  t: PluginAnalyzerSettingsTabProps['t']
}): ReactNode {
  const childFailure = diagnosis.kind === 'fiber-failed' && failedFiberIsChild(row, diagnosis.fiberUid)
  const copy = diagnosis.kind === 'fiber-failed'
    ? {
      title: childFailure ? 'fiberFailedChildTitle' as const : 'fiberFailedTitle' as const,
      reason: childFailure ? 'fiberFailedChildReason' as const : 'fiberFailedReason' as const,
      action: 'fiberFailedAction' as const,
    }
    : DIAGNOSIS_COPY[diagnosis.kind]
  const failed = row.profile.fibers.find(fiber => fiber.fiberUid === diagnosis.fiberUid)
  const params = {
    service: diagnosis.service ?? t('unknownService'),
    fiber: diagnosis.fiberUid ?? t('unknownFiber'),
    error: diagnosis.error ?? t('unknownError'),
    plugin: row.displayName,
    name: failed?.fiberName ?? t('unknownFiber'),
  }
  return (
    <section
      className={css.diagnostic}
      data-diagnosis-kind={diagnosis.kind}
      data-severity={diagnosis.severity}
      aria-label={t(copy.title)}
    >
      <div className={css.diagnosticHeading}>
        <span className={css.diagnosticIcon} aria-hidden="true"><IconWarningOutlineMedium /></span>
        <div>
          <span className={css.eyebrow}>{t('observedIssue')}</span>
          <h3>{t(copy.title)}</h3>
        </div>
      </div>
      <dl className={css.diagnosticFacts}>
        <div>
          <dt>{t('observedReason')}</dt>
          <dd>{t(copy.reason, params)}</dd>
        </div>
        <div>
          <dt>{t('observedImpact')}</dt>
          <dd>{t('impactValue', {
            status: t(STATUS_KEYS[row.status]),
            direct: row.profile.dependency.directDependentEntryIds.length,
            transitive: row.profile.dependency.transitiveDependentEntryIds.length,
          })}</dd>
        </div>
        <div>
          <dt>{t('nextStep')}</dt>
          <dd>{t(copy.action, params)}</dd>
        </div>
      </dl>
    </section>
  )
}

/** Render exact contribution, dependency, diagnosis, and lifecycle facts for one entry. */
function EntryDetails({
  row,
  snapshot,
  t,
  id,
}: {
  row: PluginAnalyzerRow
  snapshot: PluginAnalyzerSnapshot
  t: PluginAnalyzerSettingsTabProps['t']
  id: string
}): ReactNode {
  const { profile } = row
  const dependencies = profile.fibers.flatMap(fiber =>
    fiber.dependencies.map(dependency => ({ fiber, dependency })))
  const history = snapshot.history.filter(record => record.entryId === profile.entryId)
  return (
    <div className={css.details} id={id}>
      <dl className={css.factGrid}>
        <div>
          <dt>{t('cordisPhase')}</dt>
          <dd><code>{row.rootPhase ?? t('noPhase')}</code></dd>
        </div>
        <div>
          <dt>{t('observedSince')}</dt>
          <dd><time>{new Date(profile.rootPhaseObservedSince ?? snapshot.observedSince).toISOString()}</time></dd>
        </div>
        <div>
          <dt>{t('activity')}</dt>
          <dd>{t('registrationsOnly')}</dd>
        </div>
      </dl>

      <section className={css.detailSection}>
        <h4>{t('diagnosisDetails')}</h4>
        {profile.diagnoses.length === 0 ? <p className={css.inlineFacts}>{t('healthyTitle')}</p> : (
          <ul className={css.diagnosisList} data-analyzer-diagnoses>
            {profile.diagnoses.map((diagnosis, index) => (
              <li key={`${diagnosis.kind}-${diagnosis.fiberUid ?? 'root'}-${diagnosis.service ?? index}`}>
                <code>{diagnosis.kind}</code>
                <span>{t(diagnosis.severity === 'error' ? 'errorSeverity' : 'warningSeverity')}</span>
                {diagnosis.fiberUid === null ? null : <small>{t('diagnosisFiber')} #{diagnosis.fiberUid}</small>}
                {diagnosis.service === null ? null : <small>{t('diagnosisService')} <code>{diagnosis.service}</code></small>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={css.detailSection}>
        <h4>{t('contributionDetails')}</h4>
        <div className={css.detailMetrics}>
          <Metric name="fibers" label={t('fibers')} value={profile.contribution.fiberCount} />
          <Metric name="effects" label={t('effects')} value={profile.contribution.effectCount} />
          <Metric name="listeners" label={t('listeners')} value={profile.contribution.listenerEventNames.length} />
          <Metric name="services" label={t('services')} value={profile.contribution.providedServices.length} />
        </div>
        <ul className={css.factList} data-analyzer-effects>
          {(profile.contribution.effectLabels.length === 0
            ? [t('noEffects')]
            : profile.contribution.effectLabels).map((label, index) => <li key={`${label}-${index}`}><code>{label}</code></li>)}
        </ul>
        <p className={css.inlineFacts}>
          <strong>{t('services')}:</strong>{' '}
          {profile.contribution.providedServices.length === 0
            ? t('noServices')
            : profile.contribution.providedServices.join(', ')}
        </p>
      </section>

      <section className={css.detailSection}>
        <h4>{t('dependencyDetails')}</h4>
        <div className={css.detailMetrics}>
          <Metric name="dependencies" label={t('dependencies')} value={profile.dependency.declaredCount} />
          <Metric name="missing" label={t('missingDependencies')} value={profile.dependency.missingCount} />
          <Metric name="direct-impact" label={t('directDependents')} value={profile.dependency.directDependentEntryIds.length} />
          <Metric name="transitive-impact" label={t('transitiveDependents')} value={profile.dependency.transitiveDependentEntryIds.length} />
        </div>
        <p className={css.inlineFacts}>
          <strong>{t('directDependents')}:</strong>{' '}
          {profile.dependency.directDependentEntryIds.length === 0
            ? t('noDependents')
            : profile.dependency.directDependentEntryIds.join(', ')}
        </p>
        <p className={css.inlineFacts}>
          <strong>{t('transitiveDependents')}:</strong>{' '}
          {profile.dependency.transitiveDependentEntryIds.length === 0
            ? t('noDependents')
            : profile.dependency.transitiveDependentEntryIds.join(', ')}
        </p>
        {dependencies.length === 0 ? <p className={css.inlineFacts}>{t('noDependencies')}</p> : (
          <ul className={css.dependencyList} data-analyzer-dependencies>
            {dependencies.map(({ fiber, dependency }) => (
              <li key={`${fiber.fiberUid}-${dependency.service}`} data-dependency-status={dependency.status}>
                <code>{dependency.service}</code>
                <span>{t(DEPENDENCY_KEYS[dependency.status])}</span>
                {dependency.provider !== null ? <small>→ {dependency.provider.fiberName} #{dependency.provider.fiberUid}</small> : null}
                {dependency.candidate !== null ? <small>→ {dependency.candidate.fiberName} #{dependency.candidate.fiberUid}</small> : null}
                {dependency.isolationCandidates.length > 0 ? <small>{t('isolationCandidates')}</small> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={css.detailSection}>
        <h4>{t('lifecycleDetails')}</h4>
        <div className={css.detailMetrics}>
          <Metric name="transitions" label={t('transitions')} value={profile.stability.transitionCount} />
          <Metric name="reloads" label={t('reloads')} value={profile.stability.reloadCount} />
          <Metric name="failures" label={t('failures')} value={profile.stability.failureCount} />
        </div>
        {history.length === 0 ? <p className={css.inlineFacts}>{t('noHistory')}</p> : (
          <ol className={css.history} data-analyzer-history>
            {history.map(record => (
              <li key={record.sequence}>
                <time>{new Date(record.observedAt).toISOString()}</time>
                <code>{record.previousPhase} → {record.nextPhase}</code>
                <span>#{record.fiberUid} {record.fiberName}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

/** Render one Host behavior diagnosis of enabled Loader plugins. */
export function PluginAnalyzerSettingsTab({ snapshot, t }: PluginAnalyzerSettingsTabProps): ReactNode {
  const detailsPrefix = useId()
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedView, setSelectedView] = useState<AnalyzerView | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => snapshot()).then(
      (value) => { if (current) setState({ status: 'ready', snapshot: value }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [snapshot, request])

  const diagnosis = useMemo(
    () => state.status === 'ready' ? diagnose(state.snapshot) : null,
    [state],
  )
  const activeView: AnalyzerView = selectedView
    ?? (diagnosis !== null && diagnosis.attentionRows.length > 0 ? 'attention' : 'all')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const viewRows = diagnosis === null
    ? []
    : activeView === 'attention' ? diagnosis.attentionRows : diagnosis.rows
  const filteredRows = useMemo(
    () => viewRows.filter(row => matches(row, normalizedQuery)),
    [normalizedQuery, viewRows],
  )

  useEffect(() => {
    if (expanded !== null && !filteredRows.some(row => row.entryId === expanded)) {
      setExpanded(null)
    }
  }, [expanded, filteredRows])

  const refresh = (): void => {
    setSelectedView(null)
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <p className={css.message}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={refresh}>{t('retry')}</button>
        </div>
      ) : null}
      {diagnosis !== null && state.status === 'ready' ? (
        <div className={css.diagnosis} data-plugin-analyzer-diagnosis>
          <div className={css.toolbar}>
            <dl className={css.summary} data-plugin-analyzer-summary>
              <div data-analyzer-count="enabled">
                <dt>{t('enabledCount')}</dt>
                <dd>{diagnosis.summary.enabled}</dd>
              </div>
              <div data-analyzer-count="running">
                <dt>{t('runningCount')}</dt>
                <dd>{diagnosis.summary.running}</dd>
              </div>
              <div data-analyzer-count="diagnosed">
                <dt>{t('diagnosedCount')}</dt>
                <dd>{diagnosis.summary.diagnosed}</dd>
              </div>
              <div data-analyzer-count="missing-dependencies">
                <dt>{t('missingDependencyCount')}</dt>
                <dd>{diagnosis.summary.missingDependencies}</dd>
              </div>
            </dl>
            <button className={css.refresh} type="button" onClick={refresh}>{t('refresh')}</button>
          </div>

          <div className={css.viewTabs} role="tablist" aria-label={t('tab')}>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'attention'}
              data-plugin-analyzer-view="attention"
              onClick={() => { setSelectedView('attention') }}
            >
              <IconWarningOutlineMedium aria-hidden="true" />
              <span>{t('attentionView')}</span>
              <strong>{diagnosis.attentionRows.length}</strong>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'all'}
              data-plugin-analyzer-view="all"
              onClick={() => { setSelectedView('all') }}
            >
              <IconCheckOutlineRegular aria-hidden="true" />
              <span>{t('allView')}</span>
              <strong>{diagnosis.rows.length}</strong>
            </button>
          </div>

          <label className={css.search} data-plugin-analyzer-search>
            <IconSearchOutlineRegular aria-hidden="true" />
            <span className={css.visuallyHidden}>{t('search')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('search')}
              aria-label={t('search')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>

          {diagnosis.rows.length === 0 ? <p className={css.message}>{t('empty')}</p> : null}
          {diagnosis.rows.length > 0 && activeView === 'attention' && diagnosis.attentionRows.length === 0 ? (
            <p className={css.healthyMessage}>
              <IconCheckOutlineRegular aria-hidden="true" />
              {t('allHealthy')}
            </p>
          ) : null}
          {viewRows.length > 0 && filteredRows.length === 0
            ? <p className={css.message}>{t('emptySearch')}</p>
            : null}
          {filteredRows.length > 0 ? (
            <ul className={css.rows}>
              {filteredRows.map((row) => {
                const label = t(STATUS_KEYS[row.status])
                const open = expanded === row.entryId
                const detailId = `${detailsPrefix}-${encodeURIComponent(row.entryId)}`
                return (
                  <li
                    className={css.row}
                    key={row.entryId}
                    data-plugin-analyzer-entry={row.entryId}
                    data-status={row.status}
                    data-diagnosed={row.primaryDiagnosis === null ? 'false' : 'true'}
                  >
                    <div className={css.rowHeader}>
                      <span className={css.names}>
                        <strong>{row.displayName}</strong>
                        <code>{row.moduleName}</code>
                      </span>
                      <span className={css.status} data-status={row.status}>{label}</span>
                    </div>

                    {row.primaryDiagnosis === null ? (
                      <p className={css.healthyRow}>
                        <IconCheckOutlineRegular aria-hidden="true" />
                        {t('healthyTitle')}
                      </p>
                    ) : <DiagnosisSummary diagnosis={row.primaryDiagnosis} row={row} t={t} />}

                    <dl className={css.identityFacts}>
                      <div>
                        <dt>{t('entryId')}</dt>
                        <dd><code>{row.entryId}</code></dd>
                      </div>
                      <div>
                        <dt>{t('observedAt')}</dt>
                        <dd><time>{new Date(state.snapshot.capturedAt).toISOString()}</time></dd>
                      </div>
                      <div>
                        <dt>{t('directDependents')}</dt>
                        <dd>{row.profile.dependency.directDependentEntryIds.length}</dd>
                      </div>
                      <div>
                        <dt>{t('transitiveDependents')}</dt>
                        <dd>{row.profile.dependency.transitiveDependentEntryIds.length}</dd>
                      </div>
                    </dl>

                    <button
                      className={css.evidenceButton}
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailId}
                      aria-label={t('technicalEvidenceFor', { plugin: row.displayName })}
                      onClick={() => { setExpanded(value => value === row.entryId ? null : row.entryId) }}
                    >
                      <span>{t('technicalEvidence')}</span>
                      <span aria-hidden="true">{open ? '−' : '+'}</span>
                    </button>
                    {open ? <EntryDetails row={row} snapshot={state.snapshot} t={t} id={detailId} /> : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
