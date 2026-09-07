/**
 * Drop the Loader-owned root Fiber after apply returns, and leave the row
 * enabled. `ctx.fiber.dispose()` instead marks the row disabled, which hides
 * it from Plugin Analyzer.
 */
export const name = 'self-unload'

export function apply(ctx) {
  ctx.effect(() => {
    const timer = setImmediate(() => {
      void ctx.fiber.entry?._dispose()
    })
    return () => clearImmediate(timer)
  })
}
