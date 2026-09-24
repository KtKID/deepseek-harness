# Agent Note: Cordis 派发检查器——零入侵的 waterfall 观测器

Status: proposed

[English](2026-08-16-cordis-dispatch-inspector.md) | 中文

## 问题

本 harness 的每一种行为都由插件在拦截 waterfall（瀑布式事件）上组合而成：`agent/pre-step` 决定模型看到什么，`tools/pre-execute → tools/execute → tools/post-execute` 决定工具调用是否执行、如何执行。当一轮（turn）表现异常时，开发者无法回答关键问题：到底哪个 listener 实际运行了、哪个修改了数据、哪个因未调用 `next()` 而截断了链。日志只显示「listener A 执行了、listener B 执行了」，却不显示「B 否决了、所以 C 根本没执行」。

本说明中「拦截」「否决」指*被观测*插件的行为——它们坐在 waterfall 上并可能截断它；检查器只观测，从不拦截、阻断或修改任何东西。

持久化的 [trajectory ledger](../../archived/feature/2026-07-27-trajectory-inspection-ledger.md) 投影的是会话事件，而非拦截图——在发出任何事件之前就否决的 listener 永远不会出现在那个视图里。[`cordis_inspect_*` 工具组](../../implemented/feature/2026-07-08-self-referential-cordis-toolset.zh.md) 给*模型*提供目录查询与动态插件自检（`cordis_inspect_list`、`cordis_inspect_query`、`cordis_inspect_self`），既无作用域感知，也无逐次派发轨迹。两者都无法回答「这一轮为什么会这样」。空缺在于：面向开发者、只读的 Cordis 派发图视图。

## 提案

构建一个运行时检查器，按 [capability seam](../../../../docs/glossary.zh.md#capability-seam) 拆成三个角色（名称暂定）：

- Service Definition `@deepseek-ai/dsh-inspection` —— 只读 API 加进程内 trace 存储：`snapshotGraph()`、`eligible(event, thisArg)`，以及一个 `trace` 环形缓冲。
- Provider `@deepseek-ai/dsh-inspection-cordis` —— 唯一读取 Cordis 事件总线的包；所有触及内部字段的代码都隔离在这一个 adapter 里。
- Consumer `@deepseek-ai/dsh-inspection-web` —— 两个视图：**Runtime Graph** 与 **Dispatch Trace**。

Runtime Graph 回答「谁已挂载」：每个存活 fiber（`name`、`state`、`inject`）、其提供的服务（从 `reflect.store` 按 `impl.fiber` 归并推导——`Fiber` 不暴露 `provide` 字段）、其按执行顺序注册的 hook，以及其生命周期状态（`FiberState` 共六个值：`PENDING`、`LOADING`、`ACTIVE`、`FAILED`、`UNLOADING`、`DISPOSED`）。Dispatch Trace 回答「这一轮发生了什么」：每个拦截事件的分发模式、作用域主体、合格 listener、净 payload 差异、整链耗时与最终决策。

### 零入侵边界

检查器只读，且只注册自己的 effect。它允许：

1. 读 `ctx.root.registry.values()` → `runtime.fibers`（公开 registry API），以及 `fiber.getEffects()`（公开 effect 诊断）。
2. 读 `ctx.root.events._hooks[name]` → 按执行顺序的 `Hook[]`。这是对下划线命名 Cordis 字段的唯一一次读取，且只存在于 Provider adapter 内。
3. 订阅已文档化的生命周期与派发事件 `internal/plugin`、`internal/status`、`internal/listener`、`internal/dispatch`（[`Events`](../../../../vendor/cordis/src/events.ts)）。
4. 读公开的 `dsh-scope` 导出（`scopeOf`、`scopeParentOf`、`scopeChainOf`、`carrierKeyOf`）、`Context.filter` 与 `Context.isolate` 符号，以及 `ctx.root.reflect.store`。
5. 在目标 waterfall 上注册自己的 `{ global: true, prepend: true }` 透传 listener，始终调用 `next()` 并原样返回下游决策。

它绝不修改 `_hooks`，不包装或替换其它插件的 `hook.callback`，不重排或移除其它 listener，不调用或吞掉其它插件的 `next()`，也不修改派发的 `args` 数组或 payload 对象。因此它无法改变其它插件的行为；卸载检查器后，其它插件的注册保持不变。

### 观测层级

**L1——图（只读）。** `ctx.root.registry.values()` 产出 `Plugin.Runtime` 记录，含 `fibers: DisposableList<Fiber>`；每个 `Fiber` 暴露 `name`、`state`（`FiberState`）、`inject`、`parent`、`uid`（[registry](../../../../vendor/cordis/src/registry.ts)、[fiber](../../../../vendor/cordis/src/fiber.ts)）。`internal/plugin` 与 `internal/status` 保持视图实时。`fiber.getEffects()` 产出带标签的 effect 树（`ctx.on("…")`、`ctx.provide("…")`）。

**L2——静态链（只读）。** `ctx.root.events._hooks[name]` 是按执行顺序的 `Hook[]`（prepend → `unshift`，否则 `push`）。每个 `Hook` 记录 `{ ctx, callback, prepend?, global? }`；属主是 `hook.ctx.fiber.name`，所以 listener → context → fiber → plugin 可直接反查（[`Hook`](../../../../vendor/cordis/src/events.ts)）。`internal/listener` 只在注册时触发——disposer 或 fiber 卸载移除 hook 时不发任何事件——所以图是每次从 `_hooks` 重读的快照，而非增量维护的索引。

**L3——派发（只读 + 一个自有 listener）。** `internal/dispatch` 在投递前以 `(mode, name, args, thisArg)` 触发。合格性通过重放总线所用的同一 filter 计算——`const filter = thisArg?.[Context.filter]; eligible = hooks.filter(h => h.global || !filter || filter.call(thisArg, h.ctx))`——因此 trace 列出的是「对当前主体*会运行*的人」，而非所有注册者；检查器自身的 `global` hook 必然通过该过滤，报告中予以排除，作用域主体用 `carrierKeyOf(thisArg)` 从 carrier 读取。自有前置 observer 捕获净 before/after 差异、总耗时与最终决策。

### 设计所依赖的语义

作用域事件按作用域过滤 listener。`agent/pre-step` 与三个 `tools/*` waterfall 以作用域 carrier 作为 `thisArg` 派发（[`agentCarrier`/`agentEvents`](../../../../packages/core/agent/src/dispatch.ts)）；`dispatch()` 丢弃其 `ctx` 不在主体作用域链内的 hook（[`events.ts`](../../../../vendor/cordis/src/events.ts)）。因此「注册了该事件」绝不等于「对当前主体会运行」，两个视图都报告作用域过滤后的集合。

`next()` 否决只存在于 `waterfall` 模式。`serial`、`bail`、`parallel`、`emit` 没有 `next()`；`internal/dispatch` 报告模式——但 `parallel()` 派发会上报为 `emit`（总线把 `'emit'` 作为派发类型传入），因此模式列无法区分二者——Dispatch Trace 仅对 waterfall 显示否决列。否决常常是有意为之：`agent/request-error` listener 返回 `{ kind: 'retry' }` 而不调用 `next()`，以声明恢复权，所以检查器把「返回而未调用 `next()`」报告为事实，绝不报告为缺陷。

`fiber.name` 是向上寻找最近具名祖先（否则 `root`）的 getter，一个 runtime 每次 `ctx.plugin()` 持有一个 fiber。`inject` 是「服务名 → intercept config（或 `null`）」的已解析映射。`hook.prepend` 与 `hook.global` 可选。`state === PENDING` 意为「未加载」，而非原因：归因缺失服务需要以 `fiber.ctx[Context.isolate]` 为键查 `reflect.store` 来解析每个 `inject` key——root 上下文的 isolate map 看不到 root 之下 isolate 的作用域，`ctx.root.reflect.get` 会答错作用域——所以 Graph 显示 PENDING 及其 inject keys，并*推导*缺失服务结论，而非直接读取。

`internal/dispatch` 仅对非 `internal/` 事件触发，且只在投递前；它从不揭示逐 listener 的执行或 `next()` 调用。

### 遗留缺口

逐 listener 归因——「listener X 调用了 `next()`」「X 自身的 before→after 差异」——在零入侵边界内不可观测。MVP 报告合格集合、净差异、总耗时与最终决策；人从「最终决策 = deny，作用于 `[permission, sandbox, audit]`」推断是哪个 listener 否决的。弥补该缺口是第二阶段决策，有其自身权衡（见 Alternatives）。

## Alternatives considered

**原地包装 `hook.callback`（修改 `_hooks`）。** 唯一能产出逐 listener `next()`/diff 数据的技术。本提案拒绝，因为它修改共享框架状态、破坏零入侵边界、必须幂等且可逆，并使插件在每次 sync 时重新耦合 Cordis 内部。

**扩展 `tool-cordis` 的 `cordis_inspect_*` 工具组。** 拒绝：该表面对模型服务，是目录查询与动态插件自检，无作用域过滤、无派发轨迹、无 waterfall 归因；人类调试工具与模型工具的契约和成本不同。

**基于 trajectory ledger 构建。** 拒绝：它投影持久会话事件，而非拦截图；在发出任何事件前就否决的 listener 在其中不可见。

**在 `internal/dispatch` listener 内修改派发 `args` 数组以包装最内层 `next`。** 拒绝：依赖事件与 waterfall 函数体之间未文档化的数组别名，只观测最内层 continuation，且脆弱。

**新增上游 Cordis 逐 listener 诊断事件**（`internal/listener-start` / `internal/listener-end`，或 listener 包装 hook）。作为逐 listener 归因的第二阶段路径被认可：它是 vendor 变更，所以检查器插件本身保持零入侵。

## Acceptance criteria

- 挂载的检查器为实时运行时渲染 Runtime Graph——fiber、inject/provide、hook 顺序、状态——且不改变任何其它插件的注册或行为。
- Dispatch Trace 对一次 `agent/pre-step` 或 `tools/pre-execute` 派发列出：模式、作用域主体、合格 listener、净 payload 差异、总耗时、最终决策；并省略逐 listener 归因。
- 聚焦测试挂载一个否决 listener（返回而不调用 `next()`），断言检查器报告「最终决策 = deny + 合格集合」，且其自有 observer 保持透传，行为不变。
- 卸载或重载检查器会移除其 listener，且其它插件的 `_hooks` 条目保持一致。
- Provider 是唯一读取 `_hooks` 的包；`verify-agent-note-format`、`verify-translation-pairing`、`doc-typecheck` 通过。

## Risks

- MVP 明确放弃逐 listener 的 `next()`/diff 归因。
- 读取下划线字段 `_hooks` 使一个 adapter 耦合到 Cordis 内部；vendor sync 时必须按 vendoring 策略重新验证该单一文件。
- 热 waterfall 上的全局 observer listener 每次派发增加一帧透传延迟；它是 opt-in 且保行为的，但仍存在于链中。
- 检查器绝不触及模型可见状态或写会话事件，因此 model-visible ⟺ logged 不变式保持完好。
