# Agent Note: Cordis dispatch inspector — a zero-intrusion waterfall observer

Status: proposed

English | [中文](2026-08-16-cordis-dispatch-inspector.zh.md)

## Problem

Every behavior in this harness composes from plugins on interception waterfalls: `agent/pre-step` decides what the model sees, and `tools/pre-execute → tools/execute → tools/post-execute` decide whether and how a tool call runs. When a turn behaves unexpectedly, a developer cannot answer the questions that matter: which listener actually ran, which one mutated the payload, and which one short-circuited the chain by returning without calling `next()`. Logs show that listener A and listener B ran; they do not show that B vetoed and so C never ran.

Throughout this note, "interception" and "veto" name what the *observed* plugins do — they sit on a waterfall and may short-circuit it; the inspector only observes, and never intercepts, blocks, or mutates anything.

The durable [trajectory ledger](../../archived/feature/2026-07-27-trajectory-inspection-ledger.md) projects session events, not the interception graph — a listener that vetoed before emitting anything never reaches that view. The [`cordis_inspect_*` tools](../../implemented/feature/2026-07-08-self-referential-cordis-toolset.md) hand the *model* catalog queries and dynamic-plugin self-inspection (`cordis_inspect_list`, `cordis_inspect_query`, `cordis_inspect_self`), with no scope awareness and no per-dispatch trace. Neither answers "why did this turn behave this way". The gap is a developer-facing, read-only view of the Cordis dispatch graph.

## Proposal

Build a runtime inspector, delivered as a [capability seam](../../../../docs/glossary.md#capability-seam) with three roles (tentative names):

- Service Definition `@deepseek-ai/dsh-inspection` — the read API plus an in-memory trace store: `snapshotGraph()`, `eligible(event, thisArg)`, and a `trace` ring buffer.
- Provider `@deepseek-ai/dsh-inspection-cordis` — the only package that reads the Cordis event bus; everything reaching an internal field is isolated in this one adapter.
- Consumer `@deepseek-ai/dsh-inspection-web` — two views: **Runtime Graph** and **Dispatch Trace**.

The Runtime Graph answers "who is mounted": every live fiber (`name`, `state`, `inject`), its provided services (derived from `reflect.store` grouped by `impl.fiber` — `Fiber` exposes no `provide` field), its registered hooks in execution order, and its lifecycle state (`FiberState` has six values: `PENDING`, `LOADING`, `ACTIVE`, `FAILED`, `UNLOADING`, `DISPOSED`). The Dispatch Trace answers "what happened in this turn": per interception event, the dispatch mode, the scope subject, the eligible listeners, the net payload diff, the total chain cost, and the final decision.

### The zero-intrusion boundary

The inspector reads only, and registers only its own effects. It may:

1. Read `ctx.root.registry.values()` → `runtime.fibers` (public registry API) and `fiber.getEffects()` (public effect diagnostics).
2. Read `ctx.root.events._hooks[name]` → the `Hook[]` in execution order. This is the single read of an underscore-named Cordis field, and it lives only inside the Provider adapter.
3. Subscribe to the documented lifecycle and dispatch events `internal/plugin`, `internal/status`, `internal/listener`, and `internal/dispatch` ([`Events`](../../../../vendor/cordis/src/events.ts)).
4. Read public `dsh-scope` exports (`scopeOf`, `scopeParentOf`, `scopeChainOf`, `carrierKeyOf`), the `Context.filter` and `Context.isolate` symbols, and `ctx.root.reflect.store`.
5. Register its own `{ global: true, prepend: true }` pass-through listener on the target waterfalls, which always calls `next()` and returns the downstream decision unchanged.

It must never mutate `_hooks`, wrap or replace another plugin's `hook.callback`, reorder or remove another listener, call or suppress another plugin's `next()`, or mutate the dispatch `args` array or payload objects. It therefore cannot change another plugin's behavior; disposing the inspector leaves every other plugin's registrations identical.

### Observation layers

**L1 — graph (read-only).** `ctx.root.registry.values()` yields `Plugin.Runtime` records with `fibers: DisposableList<Fiber>`; each `Fiber` exposes `name`, `state` (`FiberState`), `inject`, `parent`, and `uid` ([registry](../../../../vendor/cordis/src/registry.ts), [fiber](../../../../vendor/cordis/src/fiber.ts)). `internal/plugin` and `internal/status` keep the view live. `fiber.getEffects()` yields the labeled effect tree (`ctx.on("…")`, `ctx.provide("…")`).

**L2 — static chain (read-only).** `ctx.root.events._hooks[name]` is a `Hook[]` in execution order (prepend → `unshift`, otherwise `push`). Each `Hook` records `{ ctx, callback, prepend?, global? }`; the owner is `hook.ctx.fiber.name`, so listener → context → fiber → plugin resolves directly ([`Hook`](../../../../vendor/cordis/src/events.ts)). `internal/listener` fires on registration only — hook removal by disposer or fiber unload emits no event — so the graph is a snapshot re-read from `_hooks`, not an incrementally maintained index.

**L3 — dispatch (read-only plus one own listener).** `internal/dispatch` fires before delivery with `(mode, name, args, thisArg)`. Eligibility is computed by replaying the same filter the bus uses — `const filter = thisArg?.[Context.filter]; eligible = hooks.filter(h => h.global || !filter || filter.call(thisArg, h.ctx))` — so the trace lists who *would run* for this subject, not everyone registered; the observer's own `global` hook always passes the filter and is excluded from the report, and the scope subject is read off the carrier with `carrierKeyOf(thisArg)`. The own prepended observer captures the net before/after diff, total cost, and the final decision.

### Semantics the design relies on

Scoped events filter listeners by scope. `agent/pre-step` and the three `tools/*` waterfalls are dispatched with a scope carrier as `thisArg` ([`agentCarrier`/`agentEvents`](../../../../packages/core/agent/src/dispatch.ts)); `dispatch()` drops hooks whose `ctx` is outside the subject's scope chain ([`events.ts`](../../../../vendor/cordis/src/events.ts)). "Registered for the event" therefore never means "runs for this subject", and both views report the scope-filtered set.

`next()` veto exists only on `waterfall` mode. `serial`, `bail`, `parallel`, and `emit` have no `next()`; `internal/dispatch` reports the mode — except that `parallel()` dispatches report as `emit` (the bus passes `'emit'` as the dispatch type), so the mode column cannot distinguish them — and the Dispatch Trace shows the veto column only for waterfall. A veto is often intended: an `agent/request-error` listener returns `{ kind: 'retry' }` without `next()` to own recovery, so the inspector reports "returned without `next()`" as a fact, never as a defect.

`fiber.name` is a getter that walks to the nearest named ancestor (else `root`), and one runtime holds one fiber per `ctx.plugin()`. `inject` is a resolved map of service name → intercept config (or `null`). `hook.prepend` and `hook.global` are optional. `state === PENDING` means "not loaded", not why: attributing a missing service requires resolving each `inject` key against `reflect.store` keyed by `fiber.ctx[Context.isolate]` — the root context's isolate map misses scopes isolated below root, so `ctx.root.reflect.get` answers the wrong scope — so the Graph shows PENDING plus its inject keys and derives the missing-service verdict rather than reading one.

`internal/dispatch` fires only for non-`internal/` events, and only before delivery; it never reveals per-listener execution or `next()` calls.

### The deferred gap

Per-listener attribution — "listener X called `next()`", "X's own before→after diff" — is not observable at the zero-intrusion boundary. The MVP reports the eligible set, the net diff, the total cost, and the final decision; a human deduces which listener vetoed from "final decision = deny over `[permission, sandbox, audit]`". Closing that gap is a Phase-2 decision with its own tradeoffs (see Alternatives).

## Alternatives considered

**Wrap `hook.callback` in place by mutating `_hooks`.** The one technique that yields per-listener `next()`/diff data. Rejected for this proposal because it mutates shared framework state, breaks the zero-intrusion boundary, must be idempotent and reversible, and re-couples the plugin to Cordis internals on every sync.

**Extend `tool-cordis`'s `cordis_inspect_*` tools.** Rejected: that surface is model-facing catalog queries and dynamic-plugin self-inspection, with no scope filtering, no dispatch trace, and no waterfall attribution; a human debugging tool and a model tool have different contracts and costs.

**Build on the trajectory ledger.** Rejected: it projects durable session events, not the interception graph; a listener that vetoes before emitting anything is invisible there.

**Mutate the dispatch `args` array from an `internal/dispatch` listener to wrap the innermost `next`.** Rejected: it relies on undocumented array aliasing between the event and the waterfall body, observes only the innermost continuation, and is fragile.

**Add an upstream Cordis per-listener diagnostic event** (`internal/listener-start` / `internal/listener-end`, or a listener-wrapper hook). Endorsed as the Phase-2 path for per-listener attribution: it is a vendor change, so the inspector plugin itself stays zero-intrusion.

## Acceptance criteria

- A mounted inspector renders the Runtime Graph for the live runtime — fibers, inject/provide, hook order, state — without changing any other plugin's registration or behavior.
- The Dispatch Trace lists, for one `agent/pre-step` or `tools/pre-execute` dispatch: mode, scope subject, eligible listeners, net payload diff, total cost, and final decision; it omits per-listener attribution.
- A focused test mounts a vetoing listener (returns without `next()`) and asserts the inspector reports "final decision = deny + eligible set" while its own observer stays pass-through, so behavior is unchanged.
- Disposing or reloading the inspector removes its listeners and leaves every other plugin's `_hooks` entries identical.
- The Provider is the only package reading `_hooks`; `verify-agent-note-format`, `verify-translation-pairing`, and `doc-typecheck` pass.

## Risks

- The MVP knowingly gives up per-listener `next()`/diff attribution.
- Reading the underscore field `_hooks` couples one adapter to a Cordis internal; a vendor sync must re-validate that single file under the vendoring policy.
- A global observer listener on hot waterfalls adds one pass-through frame of latency per dispatch; it is opt-in and behavior-preserving, but still present in the chain.
- The inspector never touches model-visible state or writes session events, so the model-visible ⟺ logged invariant stays intact.
