---
kind: upgrade-guide
description: "AgentStatus gains `suspended`, Agent gains `unsuspend()`, and a user cancel now parks pending inbox work instead of resuming it on the next wake."
---

# User stop suspends the agent queue; `unsuspend()` releases it

English | [中文](guide.zh.md)

## Change

`AgentStatus` is now `'idle' | 'running' | 'suspended'`, and `Agent` gains `unsuspend()`. A `cancel({ kind: 'user' }, { keepInbox: true })` no longer lets the next waking input drain the kept queue: the agent parks it behind the derived `suspended` status, and only `unsuspend()` releases it in FIFO order. Non-user causes and cancellations without `keepInbox` keep the legacy drain behavior. Hosts that listen for `agent/status` to detect convergence must also accept `suspended`, and `api-session/status` now carries a third `suspended` boolean while `SessionSummary`/`SessionSnapshot` gain a required `suspended` field. The `ISession` face gains `unsuspend()` and `supplement()`.

## Migration

1. Agents implementing the `Agent` interface: add `unsuspend(): void` (release parked pending work; a no-op when not suspended). Around 35 test doubles in this repository were updated this way.
2. Any `status === 'idle'` convergence listener that can observe a user stop must treat `'suspended'` as converged too; see `goal-round-driver` for the reference pattern (`if (status === 'idle' || status === 'suspended')`).
3. Consumers of `api-session/status` may read the new third `suspended` parameter; summaries and snapshots must populate the new required `suspended` field.
4. Confirm by running the agent-loop suite: `npx vitest run packages/core/agent-loop` — the `suspension.spec.ts` cases describe the new semantics end to end.
