/**
 * Agent-loop 内部的挂起推导投影：折叠 turn 边界与收件箱 splice 的顺序，
 * 只回答"最后一个 user 中止的 turn 之后没有更新的排队写入且仍有待处理输入"。
 * @module dsh-agent-loop/suspension
 */

import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { SessionSeq, type TurnEndReason } from '@deepseek-ai/dsh-session'
import { z } from 'zod'

/** 挂起推导所需的持久事实。 */
export interface QueueSuspensionState {
  readonly openTurn: boolean
  readonly lastTurnEndSeq: number | null
  readonly lastTurnEndAbortedByUser: boolean
  readonly lastSpliceSeq: number | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** user 停止挂起的持久事实（agent-loop 私有）。 */
    queueSuspension: QueueSuspensionState
  }
}

const queueSuspensionSchema: z.ZodType<QueueSuspensionState> = z.object({
  openTurn: z.boolean(),
  lastTurnEndSeq: z.number().int().nonnegative().transform(SessionSeq).nullable(),
  lastTurnEndAbortedByUser: z.boolean(),
  lastSpliceSeq: z.number().int().nonnegative().transform(SessionSeq).nullable(),
})

/** 折叠 turn 边界与收件箱写入到挂起推导事实。 */
export const queueSuspensionProjectionDefinition = {
  key: 'queueSuspension',
  stateVersion: 1,
  stateSchema: queueSuspensionSchema,
  init: (): QueueSuspensionState => ({
    openTurn: false,
    lastTurnEndSeq: null,
    lastTurnEndAbortedByUser: false,
    lastSpliceSeq: null,
  }),
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start':
        return { ...state, openTurn: true }
      case 'turn/end': {
        const reason: TurnEndReason = event.data.reason
        return {
          ...state,
          openTurn: false,
          lastTurnEndSeq: event.seq,
          lastTurnEndAbortedByUser:
            reason.kind === 'aborted' && reason.reason.kind === 'user',
        }
      }
      case 'agent/inbox/spliced':
        return { ...state, lastSpliceSeq: event.seq }
      default:
        return state
    }
  },
} satisfies ProjectionDefinition<'queueSuspension', QueueSuspensionState>

/**
 * 从持久事实推导重启时的挂起：最后 turn 以 user 中止、其后没有更新的
 * 收件箱写入，且仍有待处理输入。
 * @param facts - 投影状态；未注册视为不挂起。
 * @param hasPending - 当前收件箱是否有待处理输入。
 */
export function suspendedFromFacts(
  facts: QueueSuspensionState | undefined,
  hasPending: boolean,
): boolean {
  if (facts === undefined) return false
  return !facts.openTurn
    && facts.lastTurnEndAbortedByUser
    && facts.lastTurnEndSeq !== null
    && (facts.lastSpliceSeq === null || facts.lastSpliceSeq < facts.lastTurnEndSeq)
    && hasPending
}
