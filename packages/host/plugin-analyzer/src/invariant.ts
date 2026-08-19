/** Package-owned retention invariant for `@deepseek-ai/dsh-host-plugin-analyzer`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type PluginAnalyzerGateway from './index.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-plugin-analyzer'

/** Cordis companion plugin name. */
export const name = 'host-plugin-analyzer-invariant'
/** Services required before the companion can inspect collector-owned history. */
export const inject = ['invariants']

/** Assert that the retained sequence is one bounded contiguous suffix. */
function verify(gateway: PluginAnalyzerGateway, fail: InvariantFailure): void {
  const state = gateway.invariantState()
  if (state.historySize > state.historyLimit) {
    fail(`history contains ${state.historySize} records above its ${state.historyLimit} record limit`)
  }
  if (state.historySize === 0) {
    if (state.oldestSequence !== null || state.newestSequence !== null) {
      fail('empty history exposes a sequence endpoint')
    }
    return
  }
  if (state.oldestSequence === null || state.newestSequence === null) {
    fail('non-empty history is missing a sequence endpoint')
  }
  if (state.newestSequence - state.oldestSequence + 1 !== state.historySize) {
    fail('retained history is not a contiguous sequence suffix')
  }
}

/** Install an O(1) check after every lifecycle transition. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const gateway = ctx.get('pluginAnalyzer') as PluginAnalyzerGateway
  verify(gateway, fail)
  ctx.on('internal/status', () => { verify(gateway, fail) })
}, { inject: ['pluginAnalyzer'] })

/**
 * Register the package-owned invariant companion.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns Installed registration disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
