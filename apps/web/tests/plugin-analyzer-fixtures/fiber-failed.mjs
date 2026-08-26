export const name = 'testAnalyzeFiberFailed'

export function apply(ctx) {
  const child = ctx.plugin(function testAnalyzeFailedChild() {
    throw new Error('private test fixture failure')
  })
  void child.await().catch(() => {})
}
