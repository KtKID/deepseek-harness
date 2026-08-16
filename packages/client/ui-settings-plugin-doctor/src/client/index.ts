/** Enabled-plugin runtime diagnosis registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PluginDoctorSettingsTab, type PluginDoctorSettingsTabInjected } from './PluginDoctorSettingsTab.tsx'
import { en, zh, type PluginDoctorLocaleKey } from './locales.ts'

export type { PluginDoctorSettingsTabInjected, PluginDoctorSettingsTabProps } from './PluginDoctorSettingsTab.tsx'
export type { PluginDoctorLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Enabled-plugin runtime diagnosis copy. */
    'settings.pluginDoctor': PluginDoctorLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginDoctor'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory']

/** Contribute the lazy Plugin Doctor tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-doctor: dictionaries')

  const t = ctx.locale.bind(NS)
  const list: PluginDoctorSettingsTabInjected['list'] = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) {
      throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const injected = (): PluginDoctorSettingsTabInjected => ({ list })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'doctor',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginDoctorSettingsTab))
}
