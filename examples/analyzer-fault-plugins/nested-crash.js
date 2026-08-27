/**
 * Root apply must succeed so the Loader row stays enabled; the nested Fiber
 * is the failed subject. Swallow the child rejection: an unhandled rejection
 * is a fatal load failure for `dsh`.
 */
export const name = 'nested-crash'

export function apply(ctx) {
  const child = ctx.plugin(function nestedCrashChild() {
    throw new Error('nested helper failed to start')
  })
  void child.await().catch(() => {})
}
