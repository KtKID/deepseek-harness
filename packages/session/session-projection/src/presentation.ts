/**
 * Browser-safe session presentation discriminator and blank-list visibility.
 * @module @deepseek-ai/dsh-session-projection/presentation
 */
import { z } from 'zod'
/** Validates a plugin's complete presentation hint before it enters a client frame. */
export const SessionPresentationSchema=z.object({ kind:z.string().min(1),keepBlankVisible:z.boolean() }).strict().nullable()
/** Session-local presentation selection; absent capability keeps the standard view. */
export type SessionPresentation=z.infer<typeof SessionPresentationSchema>
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { sessionPresentation:SessionPresentation }
  interface SessionProjectionMap { sessionPresentation:SessionPresentation }
}
