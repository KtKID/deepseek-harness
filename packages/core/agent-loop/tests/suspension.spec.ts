/**
 * Tests for the user-stop suspension semantics: a `user` cancel with kept
 * pending work parks the queue behind a derived `suspended` state instead of
 * letting the next waking input drain it; `unsuspend()` is the only release.
 * @module dsh-agent-loop/tests/suspension
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { suspendedFromFacts } from '../src/suspension.ts'
import { MockAdapter, textResponse } from './mock-adapter.ts'

async function harness(adapter: MockAdapter) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function send(agent: Agent, text: string) {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
}

/** Resolve on the agent's next transition into the given status (already there resolves at once). */
function waitForStatus(ctx: Context, agent: Agent, status: Agent['status']): Promise<void> {
  if (agent.status === status) return Promise.resolve()
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status: next }) => {
      if (subject === agent && next === status) { dispose(); resolve() }
    })
  })
}

/** Wait until the mock adapter has dispatched at least `count` model requests. */
async function waitForRequests(adapter: MockAdapter, count: number): Promise<void> {
  for (let n = 0; n < 100 && adapter.requests.length < count; n++) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  expect(adapter.requests.length).toBeGreaterThanOrEqual(count)
}

/** All user-message texts recorded in the log (to assert what actually ran). */
function userTexts(agent: Agent): string[] {
  return agent.session.snapshotEvents()
    .filter(e => e.type === 'user/message')
    .flatMap(e => e.type === 'user/message' ? e.data.content : [])
    .flatMap(b => b.type === 'text' ? [b.text] : [])
}

function pendingTurnTexts(agent: Agent): string[] {
  return agent.inbox.nextTurn.map(m => m.content.flatMap(b => b.type === 'text' ? [b.text] : []).join(''))
}

describe('user-stop suspension', () => {
  it('parks kept pending work behind a suspended state until unsuspend drains it in FIFO order', async () => {
    // 第一轮用 hang 钉住在途请求，取消时 'queued' 仍是待处理输入。
    // 被中止回合认领的消息按契约不重放，userTexts 不含 'first'。
    const adapter = new MockAdapter(['hang', textResponse('turn two'), textResponse('turn three')])
    const ctx = await harness(adapter)
    try {
      const agent = await ctx.agentLoop.create(SessionId('suspend-fifo'), { provider: 'mock', model: 'mock' })
      send(agent, 'first')
      await waitForStatus(ctx, agent, 'running')
      await waitForRequests(adapter, 1)
      send(agent, 'queued')
      agent.cancel({ kind: 'user' }, { keepInbox: true })
      await waitForStatus(ctx, agent, 'suspended')

      // 挂起期间新的唤醒输入只排队，不触发执行（feat03 场景1）。
      send(agent, 'new message')
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(agent.status).toBe('suspended')
      expect(adapter.requests.length).toBe(1)
      expect(pendingTurnTexts(agent)).toEqual(['queued', 'new message'])

      // 显式恢复按记录顺序放行（feat03 场景2）。
      agent.unsuspend()
      await waitForStatus(ctx, agent, 'running')
      await waitForStatus(ctx, agent, 'idle')
      expect(userTexts(agent)).toEqual(['first', 'queued', 'new message'])
      expect(agent.status).toBe('idle')
      expect(adapter.requests.length).toBe(3)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('does not suspend a user cancel without pending work', async () => {
    const adapter = new MockAdapter(['hang', textResponse('two')])
    const ctx = await harness(adapter)
    try {
      const agent = await ctx.agentLoop.create(SessionId('suspend-empty'), { provider: 'mock', model: 'mock' })
      send(agent, 'first')
      await waitForStatus(ctx, agent, 'running')
      await waitForRequests(adapter, 1)
      agent.cancel({ kind: 'user' }, { keepInbox: true })
      await waitForStatus(ctx, agent, 'idle')
      expect(agent.status).toBe('idle')
      // 停止后没有挂起队列：新输入立即执行。
      send(agent, 'later')
      await waitForStatus(ctx, agent, 'running')
      await waitForStatus(ctx, agent, 'idle')
      expect(userTexts(agent)).toEqual(['first', 'later'])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('keeps non-user cancels on the legacy drain path', async () => {
    const adapter = new MockAdapter(['hang', textResponse('two')])
    const ctx = await harness(adapter)
    try {
      const agent = await ctx.agentLoop.create(SessionId('suspend-hook'), { provider: 'mock', model: 'mock' })
      send(agent, 'first')
      await waitForStatus(ctx, agent, 'running')
      await waitForRequests(adapter, 1)
      send(agent, 'queued')
      agent.cancel({ kind: 'hook', reason: 'test' }, { keepInbox: true })
      await waitForStatus(ctx, agent, 'idle')
      expect(agent.status).toBe('idle')
      // 非用户原因保持旧行为：下一个唤醒输入放行队列。
      send(agent, 'wake')
      await waitForStatus(ctx, agent, 'running')
      await waitForStatus(ctx, agent, 'idle')
      expect(userTexts(agent)).toEqual(['first', 'queued', 'wake'])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('clears suspension when the last pending item is removed, so new input runs', async () => {
    const adapter = new MockAdapter(['hang', textResponse('two')])
    const ctx = await harness(adapter)
    try {
      const agent = await ctx.agentLoop.create(SessionId('suspend-remove'), { provider: 'mock', model: 'mock' })
      send(agent, 'first')
      await waitForStatus(ctx, agent, 'running')
      await waitForRequests(adapter, 1)
      send(agent, 'queued')
      agent.cancel({ kind: 'user' }, { keepInbox: true })
      await waitForStatus(ctx, agent, 'suspended')
      // 挂起期间删除全部待处理输入（feat03 场景4 的删除路径）。
      agent.inbox.clear()
      expect(agent.status).toBe('idle')
      send(agent, 'fresh')
      await waitForStatus(ctx, agent, 'running')
      await waitForStatus(ctx, agent, 'idle')
      expect(userTexts(agent)).toEqual(['first', 'fresh'])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('re-derives the suspended state when the session attaches again', async () => {
    const adapter = new MockAdapter(['hang', textResponse('two')])
    // resume 需要会话持久层；写句柄在 ctx 卸载时释放，因此按 resume.spec 的
    // 两上下文模式：同一 root 下先整体卸载，再在新 ctx 里 resume。
    const root = await mkdtemp(join(tmpdir(), 'dsh-suspend-'))
    const mount = async (): Promise<Context> => {
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(AgentRegistry)
      await ctx.plugin(JsonlSessionPersistence, { root })
      await ctx.plugin(AgentLoop, { agents: [] })
      ctx.llm.registerAdapter(['mock'], adapter)
      return ctx
    }
    const ctx = await mount()
    try {
      const agent = await ctx.agentLoop.create(SessionId('suspend-restart'), { provider: 'mock', model: 'mock' })
      send(agent, 'first')
      await waitForStatus(ctx, agent, 'running')
      await waitForRequests(adapter, 1)
      send(agent, 'queued')
      agent.cancel({ kind: 'user' }, { keepInbox: true })
      await waitForStatus(ctx, agent, 'suspended')
      // 卸载路径会按设计清空队列；捕获挂起时刻的事件序列，模拟崩溃遗留的日志。
      const captured = agent.session.snapshotEvents()
      await ctx.fiber.dispose()

      const ctx2 = await mount()
      try {
        const sessionId2 = SessionId('suspend-restart-2')
        const detached = ctx2.sessions.prepare(sessionId2)
        const handle = await ctx2.sessionPersistence.create(detached.header)
        await handle.append(captured)
        await handle.close()
        const { agent: revived } = await ctx2.agents.resume({ resumeSessionId: sessionId2, agentOptions: { provider: 'mock', model: 'mock' } })
        // 重新附着后挂起态与待处理输入都保持（feat03 场景4 的崩溃恢复形态）。
        expect(revived.status).toBe('suspended')
        expect(pendingTurnTexts(revived)).toEqual(['queued'])
        revived.unsuspend()
        await waitForStatus(ctx2, revived, 'running')
        await revived.whenIdle()
        expect(userTexts(revived)).toEqual(['first', 'queued'])
      } finally {
        await ctx2.fiber.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('suspendedFromFacts rejects a queue written after the aborted turn', () => {
    const base = {
      openTurn: false,
      lastTurnEndSeq: 10,
      lastTurnEndAbortedByUser: true,
      lastSpliceSeq: 5,
    }
    expect(suspendedFromFacts(base, true)).toBe(true)
    // 中止之后的队列写入代表新意图，不构成挂起。
    expect(suspendedFromFacts({ ...base, lastSpliceSeq: 12 }, true)).toBe(false)
    // 非用户原因或开着的 turn 不挂起。
    expect(suspendedFromFacts({ ...base, lastTurnEndAbortedByUser: false }, true)).toBe(false)
    expect(suspendedFromFacts({ ...base, openTurn: true }, true)).toBe(false)
    // 没有待处理输入不挂起。
    expect(suspendedFromFacts(base, false)).toBe(false)
    expect(suspendedFromFacts(undefined, true)).toBe(false)
  })
})
