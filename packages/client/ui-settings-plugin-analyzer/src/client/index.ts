/** Enabled-plugin runtime diagnosis registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import pluginAnalyzerRemote from '@deepseek-ai/dsh-host-plugin-analyzer/remote'
import { PluginAnalyzerSettingsTab, type PluginAnalyzerSettingsTabInjected } from './PluginAnalyzerSettingsTab.tsx'
import { en, zh, type PluginAnalyzerLocaleKey } from './locales.ts'

export type { PluginAnalyzerSettingsTabInjected, PluginAnalyzerSettingsTabProps } from './PluginAnalyzerSettingsTab.tsx'
export type { PluginAnalyzerLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Enabled-plugin runtime diagnosis copy. */
    'settings.pluginAnalyzer': PluginAnalyzerLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginAnalyzer'

/** Service required before this package mounts its generated Remote contribution. */
export const inject = ['remote']

const SETTINGS_INJECT = ['slots', 'locale', 'remote', 'remote.pluginAnalyzer']

/** Contribute the lazy Plugin Analyzer tab to the Plugins settings section. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(pluginAnalyzerRemote)
  const settingsFiber = ctx.plugin({
    name: 'ui-settings-plugin-analyzer: settings',
    inject: SETTINGS_INJECT,
    apply: registerSettings,
  })
  try {
    await settingsFiber
  } catch (error) {
    await disposeRemote()
    throw error
  }
  return async () => {
    await settingsFiber.dispose()
    await disposeRemote()
  }
}

/** Register the Settings consumer after its generated namespace becomes injectable. */
function registerSettings(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-analyzer: dictionaries')

  const t = ctx.locale.bind(NS)
  const snapshot: PluginAnalyzerSettingsTabInjected['snapshot'] = async () => {
    const result = await ctx.remote.pluginAnalyzer.snapshot()
    if (!result.ok) {
      throw new Error(`pluginAnalyzer.snapshot failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const injected = (): PluginAnalyzerSettingsTabInjected => ({ snapshot })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'analyzer',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginAnalyzerSettingsTab))
}
