import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { diagnose, type PluginDoctorStatus } from './diagnose.ts'
import type { PluginDoctorLocaleKey } from './locales.ts'
import css from './PluginDoctorSettingsTab.module.css'

/** Registration-side Remote face used by the Plugin Doctor tab. */
export interface PluginDoctorSettingsTabInjected {
  /** Read a current Host inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>
}

/** Full component props assembled by the Settings slot renderer. */
export type PluginDoctorSettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginDoctor'>
  & InjectFace<PluginDoctorSettingsTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginInventorySnapshot }

const STATUS_KEYS = {
  running: 'running',
  pending: 'pending',
  starting: 'starting',
  failed: 'failed',
  stopping: 'stopping',
  'not-mounted': 'notMounted',
} satisfies Record<PluginDoctorStatus, PluginDoctorLocaleKey>

/** Render one point-in-time diagnosis of enabled Loader plugins. */
export function PluginDoctorSettingsTab({ list, t }: PluginDoctorSettingsTabProps): ReactNode {
  const detailsPrefix = useId()
  const [request, setRequest] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const diagnosis = useMemo(
    () => state.status === 'ready' ? diagnose(state.snapshot) : null,
    [state],
  )

  useEffect(() => {
    if (expanded !== null && diagnosis !== null && !diagnosis.rows.some(row => row.entryId === expanded)) {
      setExpanded(null)
    }
  }, [diagnosis, expanded])

  const refresh = (): void => {
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
      {diagnosis !== null ? (
        <div className={css.diagnosis}>
          <div className={css.toolbar}>
            <dl className={css.summary} data-plugin-doctor-summary>
              <div data-doctor-count="enabled">
                <dt>{t('enabledCount')}</dt>
                <dd>{diagnosis.summary.enabled}</dd>
              </div>
              <div data-doctor-count="running">
                <dt>{t('runningCount')}</dt>
                <dd>{diagnosis.summary.running}</dd>
              </div>
              <div data-doctor-count="non-running">
                <dt>{t('nonRunningCount')}</dt>
                <dd>{diagnosis.summary.nonRunning}</dd>
              </div>
            </dl>
            <button className={css.refresh} type="button" onClick={refresh}>{t('refresh')}</button>
          </div>
          {diagnosis.rows.length === 0 ? <p className={css.message}>{t('empty')}</p> : (
            <ul className={css.rows}>
              {diagnosis.rows.map((row) => {
                const label = t(STATUS_KEYS[row.status])
                const open = expanded === row.entryId
                const detailId = `${detailsPrefix}-${encodeURIComponent(row.entryId)}`
                return (
                  <li
                    className={css.row}
                    key={row.entryId}
                    data-plugin-doctor-entry={row.entryId}
                    data-status={row.status}
                  >
                    <button
                      className={css.rowButton}
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailId}
                      aria-label={`${row.displayName}, ${label}`}
                      onClick={() => { setExpanded(value => value === row.entryId ? null : row.entryId) }}
                    >
                      <span className={css.names}>
                        <strong>{row.displayName}</strong>
                        <code>{row.moduleName}</code>
                      </span>
                      <span className={css.status} data-status={row.status}>{label}</span>
                    </button>
                    {open ? (
                      <dl className={css.details} id={detailId}>
                        <div>
                          <dt>{t('entryId')}</dt>
                          <dd><code>{row.entryId}</code></dd>
                        </div>
                        <div>
                          <dt>{t('cordisPhase')}</dt>
                          <dd><code>{row.fiberPhase ?? t('noPhase')}</code></dd>
                        </div>
                      </dl>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
