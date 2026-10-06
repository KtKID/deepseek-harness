---
kind: upgrade-guide
description: "AgentStatus 增加 `suspended`，Agent 增加 `unsuspend()`，用户取消改为挂起待发送队列而非由下一次唤醒放行。"
---

# 用户停止挂起 Agent 队列，`unsuspend()` 负责释放

[English](guide.md) | 中文

## 变更

`AgentStatus` 变为 `'idle' | 'running' | 'suspended'`，`Agent` 新增 `unsuspend()`。`cancel({ kind: 'user' }, { keepInbox: true })` 不再让下一个唤醒输入放行保留的队列：Agent 将其挂起在推导出的 `suspended` 状态之后，仅 `unsuspend()` 按 FIFO 释放。非用户原因与不带 `keepInbox` 的取消保持旧的放行行为。把 `agent/status === 'idle'` 当收敛信号的宿主必须同时接受 `suspended`；`api-session/status` 新增第三个 `suspended` 布尔参数，`SessionSummary`/`SessionSnapshot` 新增必填的 `suspended` 字段；`ISession` 新增 `unsuspend()` 与 `supplement()`。

## 迁移

1. 实现 `Agent` 接口的类型：新增 `unsuspend(): void`（释放挂起的待处理输入；未挂起时为空操作）。本仓库约 35 处测试替身已按此更新。
2. 任何可能观察到用户停止的 `status === 'idle'` 收敛监听必须把 `'suspended'` 也视为收敛；参考 `goal-round-driver` 的写法（`if (status === 'idle' || status === 'suspended')`）。
3. `api-session/status` 的消费方可读取新的第三个 `suspended` 参数；summary 与 snapshot 的构造处必须填充新的必填 `suspended` 字段。
4. 运行 agent-loop 套件确认：`npx vitest run packages/core/agent-loop` —— `suspension.spec.ts` 端到端描述了新语义。
